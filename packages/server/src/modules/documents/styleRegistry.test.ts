import { cellStyleId, type DocumentStyleDefinition } from "@openexcel/core";
import { describe, expect, it } from "vitest";
import { normalizeStyleDefinitions } from "./styleRegistry.js";

describe("style registry", () => {
  it("accepts only definitions whose id matches the canonical style", () => {
    const style = { bg: "#ffffff", fc: "#111111" };
    const valid: DocumentStyleDefinition = { id: cellStyleId(style), style };
    const invalid: DocumentStyleDefinition = { id: "style_0000000000000000", style };

    expect(normalizeStyleDefinitions([valid, invalid])).toEqual([valid]);
  });

  it("deduplicates definitions in one request", () => {
    const style = { bl: 1 };
    const definition = { id: cellStyleId(style), style };

    expect(normalizeStyleDefinitions([definition, definition])).toEqual([definition]);
  });
});
