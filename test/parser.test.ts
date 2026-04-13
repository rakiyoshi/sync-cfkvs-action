import { describe, expect, it } from "vitest";
import { parseDesiredState } from "../src/parser";

describe("parseDesiredState", () => {
  it("parses canonical format", () => {
    const input = `{
      // comment
      "data": [
        { "key": "A", "value": "1" },
        { "key": "B", "value": "2" },
      ],
    }`;

    const result = parseDesiredState(input);
    expect(result.get("A")).toBe("1");
    expect(result.get("B")).toBe("2");
  });

  it("parses flat object format", () => {
    const input = `{
      "A": "1",
      "B": "2"
    }`;

    const result = parseDesiredState(input);
    expect(result.size).toBe(2);
    expect(result.get("A")).toBe("1");
  });

  it("throws on duplicate keys", () => {
    const input = `{
      "data": [
        { "key": "A", "value": "1" },
        { "key": "A", "value": "2" }
      ]
    }`;

    expect(() => parseDesiredState(input)).toThrow(/Duplicate key/);
  });

  it("throws on invalid value type", () => {
    const input = `{
      "A": 1
    }`;

    expect(() => parseDesiredState(input)).toThrow(/must be a string/);
  });
});
