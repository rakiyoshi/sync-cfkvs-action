"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadDesiredStateFromFile = exports.parseDesiredState = void 0;
const node_fs_1 = require("node:fs");
const jsonc_parser_1 = require("jsonc-parser");
const errors_js_1 = require("./errors.js");
const ensureStringPair = (key, value) => {
    if (typeof key !== "string")
        throw new errors_js_1.ParseValidationError("Non-string keys are not allowed.");
    if (key.length === 0)
        throw new errors_js_1.ParseValidationError("Empty string keys are not allowed.");
    if (typeof value !== "string")
        throw new errors_js_1.ParseValidationError(`Value for key '${key}' must be a string.`);
    return { key, value };
};
const insertUnique = (map, key, value) => {
    if (map.has(key))
        throw new errors_js_1.ParseValidationError(`Duplicate key found in source file: ${key}`);
    map.set(key, value);
};
const parseCanonical = (rawData) => {
    if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) {
        throw new errors_js_1.ParseValidationError("Canonical format must be an object with a 'data' array.");
    }
    const data = rawData.data;
    if (!Array.isArray(data)) {
        throw new errors_js_1.ParseValidationError("Canonical format requires a top-level 'data' array.");
    }
    const map = new Map();
    for (const item of data) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            throw new errors_js_1.ParseValidationError("Each 'data' item must be an object with key and value.");
        }
        const validated = ensureStringPair(item.key, item.value);
        insertUnique(map, validated.key, validated.value);
    }
    return map;
};
const parseFlat = (rawData) => {
    if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) {
        throw new errors_js_1.ParseValidationError("Flat format must be a top-level object.");
    }
    const map = new Map();
    for (const [rawKey, rawValue] of Object.entries(rawData)) {
        const validated = ensureStringPair(rawKey, rawValue);
        insertUnique(map, validated.key, validated.value);
    }
    return map;
};
const parseDesiredState = (content) => {
    let parsed;
    try {
        parsed = (0, jsonc_parser_1.parse)(content);
    }
    catch {
        throw new errors_js_1.ParseValidationError("Invalid JSONC file content.");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new errors_js_1.ParseValidationError("Top-level JSONC value must be an object.");
    }
    if ("data" in parsed) {
        return parseCanonical(parsed);
    }
    return parseFlat(parsed);
};
exports.parseDesiredState = parseDesiredState;
const loadDesiredStateFromFile = async (filePath) => {
    let content;
    try {
        content = await node_fs_1.promises.readFile(filePath, "utf8");
    }
    catch {
        throw new errors_js_1.ParseValidationError(`Failed to read input file: ${filePath}`);
    }
    return (0, exports.parseDesiredState)(content);
};
exports.loadDesiredStateFromFile = loadDesiredStateFromFile;
