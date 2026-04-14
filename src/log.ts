import * as core from "@actions/core";
import type { LogLevel } from "./types.js";

export const createLogger = (level: LogLevel) => {
  return {
    info: (message: string) => core.info(message),
    warning: (message: string) => core.warning(message),
    debug: (message: string) => {
      if (level === "debug") {
        core.info(`[debug] ${message}`);
      }
    },
  };
};

export const maskValue = (value: string): string => {
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
};
