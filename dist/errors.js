"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AwsOperationError = exports.ParseValidationError = exports.ConfigurationError = void 0;
class ConfigurationError extends Error {
    constructor(message) {
        super(message);
        this.name = "ConfigurationError";
    }
}
exports.ConfigurationError = ConfigurationError;
class ParseValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "ParseValidationError";
    }
}
exports.ParseValidationError = ParseValidationError;
class AwsOperationError extends Error {
    cause;
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        this.name = "AwsOperationError";
    }
}
exports.AwsOperationError = AwsOperationError;
