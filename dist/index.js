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
const core = __importStar(require("@actions/core"));
const inputs_js_1 = require("./inputs.js");
const parser_js_1 = require("./parser.js");
const diff_js_1 = require("./diff.js");
const log_js_1 = require("./log.js");
const kvs_client_js_1 = require("./aws/kvs-client.js");
const errors_js_1 = require("./errors.js");
const run = async () => {
    try {
        const inputs = (0, inputs_js_1.readInputs)();
        const log = (0, log_js_1.createLogger)(inputs.logLevel);
        log.info(`Input file: ${inputs.file}`);
        log.info(`Target KVS ARN: ${inputs.kvsArn}`);
        log.info(`Dry run: ${inputs.dryRun}`);
        const desired = await (0, parser_js_1.loadDesiredStateFromFile)(inputs.file);
        const managedDesired = (0, diff_js_1.filterByPrefix)(desired, inputs.prefix);
        if (managedDesired.size === 0 && inputs.failOnEmpty) {
            throw new errors_js_1.ConfigurationError("Parsed desired dataset is empty while fail-on-empty=true.");
        }
        const kvsService = new kvs_client_js_1.KvsService();
        const current = await kvsService.listAllKeys(inputs.kvsArn);
        const diff = (0, diff_js_1.computeDiff)(desired, current, {
            deleteMissing: inputs.deleteMissing,
            prefix: inputs.prefix,
        });
        log.info(`Desired key count: ${managedDesired.size}`);
        log.info(`Current key count: ${(0, diff_js_1.filterByPrefix)(current, inputs.prefix).size}`);
        log.info(`Put count: ${diff.puts.length}`);
        log.info(`Delete count: ${diff.deletes.length}`);
        const previewPuts = diff.puts.slice(0, inputs.maxPreviewItems);
        const previewDeletes = diff.deletes.slice(0, inputs.maxPreviewItems);
        if (previewPuts.length > 0) {
            log.info("Put preview:");
            for (const item of previewPuts) {
                log.info(`  ${item.key} = ${(0, log_js_1.maskValue)(item.value)}`);
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
        if (diff.deletes.length > 0 && diff.deletes.length === (0, diff_js_1.filterByPrefix)(current, inputs.prefix).size) {
            log.warning("All managed keys are scheduled for deletion.");
        }
        if (diff.deletes.length >= 100) {
            log.warning(`Large delete set detected: ${diff.deletes.length} keys.`);
        }
        await kvsService.applyDiff(inputs.kvsArn, diff.puts, diff.deletes);
        log.info("Synchronization completed successfully.");
    }
    catch (error) {
        if (error instanceof errors_js_1.ConfigurationError || error instanceof errors_js_1.ParseValidationError) {
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
