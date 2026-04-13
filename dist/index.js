"use strict";
const core = require("@actions/core");
const { promises: fs } = require("node:fs");
const { parse } = require("jsonc-parser");
const {
  CloudFrontKeyValueStoreClient,
  DescribeKeyValueStoreCommand,
  ListKeysCommand,
  UpdateKeysCommand,
} = require("@aws-sdk/client-cloudfront-keyvaluestore");

class ConfigurationError extends Error {}
class ParseValidationError extends Error {}
class AwsOperationError extends Error {
  constructor(message, cause) {
    super(message);
    this.cause = cause;
  }
}

const createLogger = (level) => ({
  info: (m) => core.info(m),
  warning: (m) => core.warning(m),
  debug: (m) => level === "debug" && core.info(`[debug] ${m}`),
});

const maskValue = (value) => (value.length <= 4 ? "****" : `${value.slice(0, 2)}***${value.slice(-2)}`);

const getBooleanInput = (name, defaultValue) => {
  const raw = core.getInput(name) || String(defaultValue);
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new ConfigurationError(`Input '${name}' must be 'true' or 'false'.`);
};

const getIntegerInput = (name, defaultValue) => {
  const raw = core.getInput(name) || String(defaultValue);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ConfigurationError(`Input '${name}' must be a non-negative integer.`);
  }
  return parsed;
};

const readInputs = () => {
  const logLevel = core.getInput("log-level") || "info";
  if (logLevel !== "info" && logLevel !== "debug") {
    throw new ConfigurationError("Input 'log-level' must be either 'info' or 'debug'.");
  }
  return {
    kvsArn: core.getInput("kvs-arn", { required: true }).trim(),
    file: core.getInput("file", { required: true }).trim(),
    dryRun: getBooleanInput("dry-run", false),
    deleteMissing: getBooleanInput("delete-missing", true),
    failOnEmpty: getBooleanInput("fail-on-empty", true),
    maxPreviewItems: getIntegerInput("max-preview-items", 50),
    logLevel,
    awsRegion: (core.getInput("aws-region") || "us-east-1").trim(),
    prefix: (core.getInput("prefix") || "").trim(),
  };
};

const ensureStringPair = (key, value) => {
  if (typeof key !== "string") throw new ParseValidationError("Non-string keys are not allowed.");
  if (key.length === 0) throw new ParseValidationError("Empty string keys are not allowed.");
  if (typeof value !== "string") throw new ParseValidationError(`Value for key '${key}' must be a string.`);
  return { key, value };
};

const parseDesiredState = (content) => {
  let parsed;
  try {
    parsed = parse(content);
  } catch {
    throw new ParseValidationError("Invalid JSONC file content.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ParseValidationError("Top-level JSONC value must be an object.");
  }
  const map = new Map();
  const insert = (k, v) => {
    if (map.has(k)) throw new ParseValidationError(`Duplicate key found in source file: ${k}`);
    map.set(k, v);
  };

  if (Object.prototype.hasOwnProperty.call(parsed, "data")) {
    const data = parsed.data;
    if (!Array.isArray(data)) throw new ParseValidationError("Canonical format requires a top-level 'data' array.");
    for (const item of data) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new ParseValidationError("Each 'data' item must be an object with key and value.");
      }
      const { key, value } = ensureStringPair(item.key, item.value);
      insert(key, value);
    }
  } else {
    for (const [k, v] of Object.entries(parsed)) {
      const validated = ensureStringPair(k, v);
      insert(validated.key, validated.value);
    }
  }

  return map;
};

const loadDesiredStateFromFile = async (filePath) => {
  let content;
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch {
    throw new ParseValidationError(`Failed to read input file: ${filePath}`);
  }
  return parseDesiredState(content);
};

const filterByPrefix = (state, prefix) => {
  if (!prefix) return state;
  const filtered = new Map();
  for (const [k, v] of state.entries()) {
    if (k.startsWith(prefix)) filtered.set(k, v);
  }
  return filtered;
};

const computeDiff = (desiredRaw, currentRaw, options) => {
  const desired = filterByPrefix(desiredRaw, options.prefix);
  const current = filterByPrefix(currentRaw, options.prefix);
  const puts = [];
  const deletes = [];
  let unchangedCount = 0;

  for (const [key, desiredValue] of desired.entries()) {
    const currentValue = current.get(key);
    if (currentValue === undefined || currentValue !== desiredValue) puts.push({ key, value: desiredValue });
    else unchangedCount += 1;
  }

  if (options.deleteMissing) {
    for (const key of current.keys()) {
      if (!desired.has(key)) deletes.push({ key });
    }
  }

  return { puts, deletes, unchangedCount };
};

class KvsService {
  constructor(region, maxRetries = 3) {
    this.client = new CloudFrontKeyValueStoreClient({ region });
    this.maxRetries = maxRetries;
  }

  async listAllKeys(kvsArn) {
    const map = new Map();
    let nextToken;
    do {
      const result = await this.client.send(new ListKeysCommand({ KvsARN: kvsArn, NextToken: nextToken }));
      for (const item of result.Items || []) {
        if (item.Key && typeof item.Value === "string") map.set(item.Key, item.Value);
      }
      nextToken = result.NextToken;
    } while (nextToken);
    return map;
  }

  async applyDiff(kvsArn, puts, deletes) {
    if (puts.length === 0 && deletes.length === 0) return;
    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      try {
        const described = await this.client.send(new DescribeKeyValueStoreCommand({ KvsARN: kvsArn }));
        if (!described.ETag) throw new AwsOperationError("DescribeKeyValueStore did not return ETag.");
        await this.client.send(
          new UpdateKeysCommand({
            KvsARN: kvsArn,
            IfMatch: described.ETag,
            Puts: puts.map((x) => ({ Key: x.key, Value: x.value })),
            Deletes: deletes.map((x) => ({ Key: x.key })),
          }),
        );
        return;
      } catch (error) {
        if (attempt === this.maxRetries) {
          throw new AwsOperationError(
            `KVS update failed after ${this.maxRetries} retries due to concurrent modification`,
            error,
          );
        }
      }
    }
  }
}

const run = async () => {
  try {
    const inputs = readInputs();
    const log = createLogger(inputs.logLevel);

    log.info(`Input file: ${inputs.file}`);
    log.info(`Target KVS ARN: ${inputs.kvsArn}`);
    log.info(`Dry run: ${inputs.dryRun}`);

    const desired = await loadDesiredStateFromFile(inputs.file);
    const managedDesired = filterByPrefix(desired, inputs.prefix);
    if (managedDesired.size === 0 && inputs.failOnEmpty) {
      throw new ConfigurationError("Parsed desired dataset is empty while fail-on-empty=true.");
    }

    const kvsService = new KvsService(inputs.awsRegion);
    const current = await kvsService.listAllKeys(inputs.kvsArn);
    const managedCurrent = filterByPrefix(current, inputs.prefix);
    const diff = computeDiff(desired, current, { deleteMissing: inputs.deleteMissing, prefix: inputs.prefix });

    log.info(`Desired key count: ${managedDesired.size}`);
    log.info(`Current key count: ${managedCurrent.size}`);
    log.info(`Put count: ${diff.puts.length}`);
    log.info(`Delete count: ${diff.deletes.length}`);

    for (const item of diff.puts.slice(0, inputs.maxPreviewItems)) log.info(`  ${item.key} = ${maskValue(item.value)}`);
    for (const item of diff.deletes.slice(0, inputs.maxPreviewItems)) log.info(`  ${item.key}`);

    if (inputs.dryRun) {
      log.info("Dry-run mode enabled. No KVS write API calls were made.");
      return;
    }

    if (diff.puts.length === 0 && diff.deletes.length === 0) {
      log.info("No changes needed. KVS already matches desired state.");
      return;
    }

    if (diff.deletes.length > 0 && diff.deletes.length === managedCurrent.size) {
      log.warning("All managed keys are scheduled for deletion.");
    }

    if (diff.deletes.length >= 100) log.warning(`Large delete set detected: ${diff.deletes.length} keys.`);

    await kvsService.applyDiff(inputs.kvsArn, diff.puts, diff.deletes);
    log.info("Synchronization completed successfully.");
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
    else core.setFailed("Unexpected internal error.");
  }
};

void run();
