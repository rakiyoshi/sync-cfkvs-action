import * as core from "@actions/core";
import { readInputs } from "./inputs.js";
import { loadDesiredStateFromFile } from "./parser.js";
import { computeDiff, filterByPrefix } from "./diff.js";
import { createLogger, maskValue } from "./log.js";
import { KvsService } from "./aws/kvs-client.js";
import { ConfigurationError, ParseValidationError } from "./errors.js";

const run = async (): Promise<void> => {
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

    const kvsService = new KvsService();
    const current = await kvsService.listAllKeys(inputs.kvsArn);

    const diff = computeDiff(desired, current, {
      deleteMissing: inputs.deleteMissing,
      prefix: inputs.prefix,
    });

    log.info(`Desired key count: ${managedDesired.size}`);
    log.info(`Current key count: ${filterByPrefix(current, inputs.prefix).size}`);
    log.info(`Put count: ${diff.puts.length}`);
    log.info(`Delete count: ${diff.deletes.length}`);

    const previewPuts = diff.puts.slice(0, inputs.maxPreviewItems);
    const previewDeletes = diff.deletes.slice(0, inputs.maxPreviewItems);

    if (previewPuts.length > 0) {
      log.info("Put preview:");
      for (const item of previewPuts) {
        log.info(`  ${item.key} = ${maskValue(item.value)}`);
      }
    }

    if (previewDeletes.length > 0) {
      log.info("Delete preview:");
      for (const item of previewDeletes) {
        log.info(`  ${item.key}`);
      }
    }

    if (inputs.dryRun) {
      log.info("Dry-run mode enabled. No KVS write API calls were made.");
      return;
    }

    if (diff.puts.length === 0 && diff.deletes.length === 0) {
      log.info("No changes needed. KVS already matches desired state.");
      return;
    }

    if (diff.deletes.length > 0 && diff.deletes.length === filterByPrefix(current, inputs.prefix).size) {
      log.warning("All managed keys are scheduled for deletion.");
    }

    if (diff.deletes.length >= 100) {
      log.warning(`Large delete set detected: ${diff.deletes.length} keys.`);
    }

    await kvsService.applyDiff(inputs.kvsArn, diff.puts, diff.deletes);
    log.info("Synchronization completed successfully.");
  } catch (error) {
    if (error instanceof ConfigurationError || error instanceof ParseValidationError) {
      core.setFailed(error.message);
      return;
    }

    if (error instanceof Error) {
      core.setFailed(error.message);
      return;
    }

    core.setFailed("Unexpected internal error.");
  }
};

void run();
