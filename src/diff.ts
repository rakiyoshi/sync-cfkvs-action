import type { DeleteItem, DesiredState, DiffResult, ManagedState, PutItem } from "./types.js";

const startsWithPrefix = (key: string, prefix: string): boolean =>
  prefix.length === 0 ? true : key.startsWith(prefix);

export const filterByPrefix = (state: Map<string, string>, prefix: string): Map<string, string> => {
  if (!prefix) return state;
  const filtered = new Map<string, string>();
  for (const [k, v] of state.entries()) {
    if (startsWithPrefix(k, prefix)) filtered.set(k, v);
  }
  return filtered;
};

export const computeDiff = (
  desiredRaw: DesiredState,
  currentRaw: ManagedState,
  options: { deleteMissing: boolean; prefix: string },
): DiffResult => {
  const desired = filterByPrefix(desiredRaw, options.prefix);
  const current = filterByPrefix(currentRaw, options.prefix);

  const puts: PutItem[] = [];
  const deletes: DeleteItem[] = [];
  let unchangedCount = 0;

  for (const [key, desiredValue] of desired.entries()) {
    const currentValue = current.get(key);
    if (currentValue === undefined || currentValue !== desiredValue) {
      puts.push({ key, value: desiredValue });
    } else {
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
