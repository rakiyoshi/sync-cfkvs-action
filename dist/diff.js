"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeDiff = exports.filterByPrefix = void 0;
const startsWithPrefix = (key, prefix) => prefix.length === 0 ? true : key.startsWith(prefix);
const filterByPrefix = (state, prefix) => {
    if (!prefix)
        return state;
    const filtered = new Map();
    for (const [k, v] of state.entries()) {
        if (startsWithPrefix(k, prefix))
            filtered.set(k, v);
    }
    return filtered;
};
exports.filterByPrefix = filterByPrefix;
const computeDiff = (desiredRaw, currentRaw, options) => {
    const desired = (0, exports.filterByPrefix)(desiredRaw, options.prefix);
    const current = (0, exports.filterByPrefix)(currentRaw, options.prefix);
    const puts = [];
    const deletes = [];
    let unchangedCount = 0;
    for (const [key, desiredValue] of desired.entries()) {
        const currentValue = current.get(key);
        if (currentValue === undefined || currentValue !== desiredValue) {
            puts.push({ key, value: desiredValue });
        }
        else {
            unchangedCount += 1;
        }
    }
    if (options.deleteMissing) {
        for (const key of current.keys()) {
            if (!desired.has(key)) {
                deletes.push({ key });
            }
        }
    }
    return { puts, deletes, unchangedCount };
};
exports.computeDiff = computeDiff;
