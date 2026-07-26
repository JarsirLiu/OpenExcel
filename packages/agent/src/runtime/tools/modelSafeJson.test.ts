import { describe, expect, it } from "vitest";
import { toModelSafeJsonValue } from "./modelSafeJson.js";

describe("toModelSafeJsonValue", () => {
  it("converts persistence values into provider-safe JSON", () => {
    const result = toModelSafeJsonValue({
      id: 7,
      createdAt: new Date("2026-07-26T08:00:00.000Z"),
      optional: undefined,
      rows: [undefined, { value: "ok" }],
    });

    expect(result).toEqual({
      id: 7,
      createdAt: "2026-07-26T08:00:00.000Z",
      rows: [null, { value: "ok" }],
    });
  });

  it("rejects circular executor results", () => {
    const value: Record<string, unknown> = {};
    value.self = value;

    expect(() => toModelSafeJsonValue(value)).toThrow("circular reference");
  });
});
