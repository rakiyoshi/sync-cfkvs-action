import * as core from "@actions/core";
import type { ActionInputs, LogLevel } from "./types.js";
import { ConfigurationError } from "./errors.js";

const getBooleanInput = (name: string, defaultValue: boolean): boolean => {
  const raw = core.getInput(name) || String(defaultValue);
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new ConfigurationError(`Input '${name}' must be 'true' or 'false'.`);
};

const getIntegerInput = (name: string, defaultValue: number): number => {
  const raw = core.getInput(name) || String(defaultValue);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ConfigurationError(`Input '${name}' must be a non-negative integer.`);
  }
  return parsed;
};

export const readInputs = (): ActionInputs => {
  const kvsArn = core.getInput("kvs-arn", { required: true }).trim();
  const file = core.getInput("file", { required: true }).trim();
  const logLevel = (core.getInput("log-level") || "info") as LogLevel;

  if (logLevel !== "info" && logLevel !== "debug") {
    throw new ConfigurationError("Input 'log-level' must be either 'info' or 'debug'.");
  }

  return {
    kvsArn,
    file,
    dryRun: getBooleanInput("dry-run", false),
    deleteMissing: getBooleanInput("delete-missing", true),
    failOnEmpty: getBooleanInput("fail-on-empty", true),
    maxPreviewItems: getIntegerInput("max-preview-items", 50),
    logLevel,
    awsRegion: (core.getInput("aws-region") || "us-east-1").trim(),
    prefix: (core.getInput("prefix") || "").trim(),
  };
};
