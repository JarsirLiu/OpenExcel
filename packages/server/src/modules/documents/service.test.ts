import { describe, expect, it } from "vitest";
import { parseDocumentRange } from "./service.js";

describe("parseDocumentRange", () => {
  it("converts A1 notation to zero-based coordinates", () => {
    expect(parseDocumentRange("B2:D4")).toEqual({
      startRow: 1,
      startCol: 1,
      endRow: 3,
      endCol: 3,
    });
  });

  it("supports sheet-qualified references", () => {
    expect(parseDocumentRange("Sales!A1")).toEqual({
      startRow: 0,
      startCol: 0,
      endRow: 0,
      endCol: 0,
    });
  });
});
