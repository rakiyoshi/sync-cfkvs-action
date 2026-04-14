import { promises as fs } from "node:fs";
import { parse } from "jsonc-parser";
import type { DesiredState } from "./types.js";
import { ParseValidationError } from "./errors.js";

type CanonicalRecord = { key: unknown; value: unknown };

const ensureStringPair = (key: unknown, value: unknown): { key: string; value: string } => {
  if (typeof key !== "string") throw new ParseValidationError("Non-string keys are not allowed.");
  if (key.length === 0) throw new ParseValidationError("Empty string keys are not allowed.");
  if (typeof value !== "string") throw new ParseValidationError(`Value for key '${key}' must be a string.`);
  return { key, value };
};

const insertUnique = (map: DesiredState, key: string, value: string): void => {
  if (map.has(key)) throw new ParseValidationError(`Duplicate key found in source file: ${key}`);
  map.set(key, value);
};

const parseCanonical = (rawData: unknown): DesiredState => {
  if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) {
    throw new ParseValidationError("Canonical format must be an object with a 'data' array.");
  }

  const data = (rawData as { data?: unknown }).data;
  if (!Array.isArray(data)) {
    throw new ParseValidationError("Canonical format requires a top-level 'data' array.");
  }

  const map: DesiredState = new Map();
  for (const item of data as CanonicalRecord[]) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ParseValidationError("Each 'data' item must be an object with key and value.");
    }
    const validated = ensureStringPair(item.key, item.value);
    insertUnique(map, validated.key, validated.value);
  }
  return map;
};

const parseFlat = (rawData: unknown): DesiredState => {
  if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) {
    throw new ParseValidationError("Flat format must be a top-level object.");
  }

  const map: DesiredState = new Map();
  for (const [rawKey, rawValue] of Object.entries(rawData)) {
    const validated = ensureStringPair(rawKey, rawValue);
    insertUnique(map, validated.key, validated.value);
  }
  return map;
};

export const parseDesiredState = (content: string): DesiredState => {
  let parsed: unknown;
  try {
    parsed = parse(content);
  } catch {
    throw new ParseValidationError("Invalid JSONC file content.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ParseValidationError("Top-level JSONC value must be an object.");
  }

  if ("data" in parsed) {
    return parseCanonical(parsed);
  }

  return parseFlat(parsed);
};

export const loadDesiredStateFromFile = async (filePath: string): Promise<DesiredState> => {
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch {
    throw new ParseValidationError(`Failed to read input file: ${filePath}`);
  }

  return parseDesiredState(content);
};
