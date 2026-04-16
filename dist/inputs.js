"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.readInputs = void 0;
const core = __importStar(require("@actions/core"));
const errors_js_1 = require("./errors.js");
const getBooleanInput = (name, defaultValue) => {
    const raw = core.getInput(name) || String(defaultValue);
    if (raw === "true")
        return true;
    if (raw === "false")
        return false;
    throw new errors_js_1.ConfigurationError(`Input '${name}' must be 'true' or 'false'.`);
};
const getIntegerInput = (name, defaultValue) => {
    const raw = core.getInput(name) || String(defaultValue);
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new errors_js_1.ConfigurationError(`Input '${name}' must be a non-negative integer.`);
    }
    return parsed;
};
const readInputs = () => {
    const kvsArn = core.getInput("kvs-arn", { required: true }).trim();
    const file = core.getInput("file", { required: true }).trim();
    const logLevel = (core.getInput("log-level") || "info");
    if (logLevel !== "info" && logLevel !== "debug") {
        throw new errors_js_1.ConfigurationError("Input 'log-level' must be either 'info' or 'debug'.");
    }
    return {
        kvsArn,
        file,
        dryRun: getBooleanInput("dry-run", false),
        deleteMissing: getBooleanInput("delete-missing", true),
        failOnEmpty: getBooleanInput("fail-on-empty", true),
        maxPreviewItems: getIntegerInput("max-preview-items", 50),
        logLevel,
        prefix: (core.getInput("prefix") || "").trim(),
    };
};
exports.readInputs = readInputs;
