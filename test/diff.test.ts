import { describe, expect, it } from "vitest";
import { computeDiff } from "../src/diff";

describe("computeDiff", () => {
  it("builds puts/deletes for full sync", () => {
    const desired = new Map([
      ["A", "10"],
      ["C", "3"],
      ["D", "4"],
    ]);
    const current = new Map([
      ["A", "1"],
      ["B", "2"],
      ["C", "3"],
    ]);

    const diff = computeDiff(desired, current, { deleteMissing: true, prefix: "" });

    expect(diff.puts).toEqual([
      { key: "A", value: "10" },
      { key: "D", value: "4" },
    ]);
    expect(diff.deletes).toEqual([{ key: "B" }]);
    expect(diff.unchangedCount).toBe(1);
  });

  it("does not delete missing keys when deleteMissing=false", () => {
    const desired = new Map([["A", "1"]]);
    const current = new Map([
      ["A", "1"],
      ["B", "2"],
    ]);

    const diff = computeDiff(desired, current, { deleteMissing: false, prefix: "" });

    expect(diff.deletes).toEqual([]);
  });

  it("applies prefix filtering", () => {
    const desired = new Map([
      ["app:A", "1"],
      ["other:B", "2"],
    ]);
    const current = new Map([
      ["app:C", "3"],
      ["other:B", "2"],
    ]);

    const diff = computeDiff(desired, current, { deleteMissing: true, prefix: "app:" });

    expect(diff.puts).toEqual([{ key: "app:A", value: "1" }]);
    expect(diff.deletes).toEqual([{ key: "app:C" }]);
  });
});
