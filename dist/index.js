"use strict";

const fs = require("node:fs/promises");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

class ActionError extends Error {}

const getInput = (name, required = false, defaultValue = "") => {
  const envName = `INPUT_${name.replace(/ /g, "_").replace(/-/g, "_").toUpperCase()}`;
  const value = (process.env[envName] ?? defaultValue).trim();
  if (required && value.length === 0) {
    throw new ActionError(`Missing required input: ${name}`);
  }
  return value;
};

const setFailed = (message) => {
  process.stderr.write(`::error::${message}\n`);
  process.exitCode = 1;
};

const info = (message) => process.stdout.write(`${message}\n`);
const warning = (message) => process.stdout.write(`::warning::${message}\n`);

const parseBoolean = (raw, name) => {
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new ActionError(`Input '${name}' must be 'true' or 'false'.`);
};

const parseInteger = (raw, name) => {
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 0) {
    throw new ActionError(`Input '${name}' must be a non-negative integer.`);
  }
  return value;
};

const stripJsonComments = (text) => {
  let result = "";
  let inString = false;
  let quote = "";
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const n = text[i + 1];

    if (inLineComment) {
      if (c === "\n") {
        inLineComment = false;
        result += c;
      }
      continue;
    }

    if (inBlockComment) {
      if (c === "*" && n === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (inString) {
      result += c;
      if (c === "\\") {
        result += n;
        i += 1;
        continue;
      }
      if (c === quote) {
        inString = false;
        quote = "";
      }
      continue;
    }

    if (c === '"' || c === "'") {
      inString = true;
      quote = c;
      result += c;
      continue;
    }

    if (c === "/" && n === "/") {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (c === "/" && n === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }

    result += c;
  }

  return result;
};

const removeTrailingCommas = (text) => {
  return text.replace(/,\s*([}\]])/g, "$1");
};

const parseJsonc = (text) => {
  const sanitized = removeTrailingCommas(stripJsonComments(text));
  return JSON.parse(sanitized);
};

const parseDesiredState = (text) => {
  let parsed;
  try {
    parsed = parseJsonc(text);
  } catch {
    throw new ActionError("Failed to parse JSONC file.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ActionError("Top-level JSONC value must be an object.");
  }

  const map = new Map();
  const put = (key, value) => {
    if (typeof key !== "string" || key.length === 0) throw new ActionError("Invalid key found.");
    if (typeof value !== "string") throw new ActionError(`Value for key '${key}' must be a string.`);
    if (map.has(key)) throw new ActionError(`Duplicate key found in source file: ${key}`);
    map.set(key, value);
  };

  if (Object.prototype.hasOwnProperty.call(parsed, "data")) {
    if (!Array.isArray(parsed.data)) throw new ActionError("Canonical format requires 'data' array.");
    for (const item of parsed.data) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new ActionError("Each canonical item must be an object.");
      }
      put(item.key, item.value);
    }
    return map;
  }

  for (const [key, value] of Object.entries(parsed)) {
    put(key, value);
  }

  return map;
};

const filterByPrefix = (map, prefix) => {
  if (!prefix) return map;
  const filtered = new Map();
  for (const [k, v] of map.entries()) {
    if (k.startsWith(prefix)) filtered.set(k, v);
  }
  return filtered;
};

const diffState = (desiredRaw, currentRaw, deleteMissing, prefix) => {
  const desired = filterByPrefix(desiredRaw, prefix);
  const current = filterByPrefix(currentRaw, prefix);

  const puts = [];
  const deletes = [];

  for (const [k, v] of desired.entries()) {
    if (current.get(k) !== v) puts.push({ key: k, value: v });
  }

  if (deleteMissing) {
    for (const k of current.keys()) {
      if (!desired.has(k)) deletes.push({ key: k });
    }
  }

  return { puts, deletes, desiredCount: desired.size, currentCount: current.size };
};

const awsCliJson = async (operation, payload) => {
  const args = [
    "cloudfront-keyvaluestore",
    operation,
    "--output",
    "json",
    "--cli-input-json",
    JSON.stringify(payload),
  ];

  try {
    const { stdout } = await execFileAsync("aws", args, { maxBuffer: 1024 * 1024 * 20 });
    return stdout ? JSON.parse(stdout) : {};
  } catch (error) {
    const stderr = error && typeof error === "object" && "stderr" in error ? error.stderr : "";
    throw new ActionError(`AWS CLI ${operation} failed. ${String(stderr || "")}`.trim());
  }
};

const listAllKeys = async (kvsArn) => {
  const result = new Map();
  let nextToken;

  do {
    const response = await awsCliJson("list-keys", { KvsARN: kvsArn, NextToken: nextToken });
    for (const item of response.Items || []) {
      if (item.Key && typeof item.Value === "string") result.set(item.Key, item.Value);
    }
    nextToken = response.NextToken;
  } while (nextToken);

  return result;
};

const updateKeysWithRetry = async (kvsArn, puts, deletes, retries = 3) => {
  if (puts.length === 0 && deletes.length === 0) return;

  for (let i = 1; i <= retries; i += 1) {
    try {
      const describe = await awsCliJson("describe-key-value-store", { KvsARN: kvsArn });
      const etag = describe.ETag;
      if (!etag) throw new ActionError("describe-key-value-store response did not include ETag.");

      await awsCliJson("update-keys", {
        KvsARN: kvsArn,
        IfMatch: etag,
        Puts: puts.map((x) => ({ Key: x.key, Value: x.value })),
        Deletes: deletes.map((x) => ({ Key: x.key })),
      });

      return;
    } catch (error) {
      if (i === retries) throw error;
      info(`Retrying update after concurrent modification (attempt ${i + 1}/${retries})`);
    }
  }
};

const maskValue = (value) => {
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
};

const run = async () => {
  try {
    const kvsArn = getInput("kvs-arn", true);
    const file = getInput("file", true);
    const dryRun = parseBoolean(getInput("dry-run", false, "false"), "dry-run");
    const deleteMissing = parseBoolean(getInput("delete-missing", false, "true"), "delete-missing");
    const failOnEmpty = parseBoolean(getInput("fail-on-empty", false, "true"), "fail-on-empty");
    const maxPreviewItems = parseInteger(getInput("max-preview-items", false, "50"), "max-preview-items");
    const prefix = getInput("prefix", false, "");

    info(`Input file: ${file}`);
    info(`Target KVS ARN: ${kvsArn}`);
    info(`Dry run: ${dryRun}`);

    const content = await fs.readFile(file, "utf8");
    const desired = parseDesiredState(content);

    if (filterByPrefix(desired, prefix).size === 0 && failOnEmpty) {
      throw new ActionError("Parsed desired dataset is empty while fail-on-empty=true.");
    }

    const current = await listAllKeys(kvsArn);
    const diff = diffState(desired, current, deleteMissing, prefix);

    info(`Desired key count: ${diff.desiredCount}`);
    info(`Current key count: ${diff.currentCount}`);
    info(`Put count: ${diff.puts.length}`);
    info(`Delete count: ${diff.deletes.length}`);

    for (const item of diff.puts.slice(0, maxPreviewItems)) {
      info(`PUT ${item.key}=${maskValue(item.value)}`);
    }
    for (const item of diff.deletes.slice(0, maxPreviewItems)) {
      info(`DEL ${item.key}`);
    }

    if (dryRun) {
      info("Dry-run mode enabled. No write API calls were made.");
      return;
    }

    if (diff.deletes.length > 0 && diff.deletes.length === diff.currentCount) {
      warning("All managed keys are scheduled for deletion.");
    }

    await updateKeysWithRetry(kvsArn, diff.puts, diff.deletes, 3);
    info("Synchronization completed successfully.");
  } catch (error) {
    setFailed(error instanceof Error ? error.message : "Unexpected internal error.");
  }
};

void run();
