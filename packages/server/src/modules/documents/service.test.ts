import { describe, expect, it } from "vitest";
import { applyOperations, parseDocumentRange } from "./service.js";

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

describe("applyOperations", () => {
  it("rejects batches that fan out across too many chunks", async () => {
    const result = await applyOperations(1, 1, {
      operations: Array.from({ length: 1_025 }, (_, index) => ({
        type: "setCell",
        row: index * 128,
        col: 0,
        value: { value: index },
      })),
    });

    expect(result).toEqual({ error: "Document operation batch touches too many chunks" });
  });

  it("rejects batches larger than the payload budget", async () => {
    const result = await applyOperations(1, 1, {
      operations: [
        {
          type: "setCell",
          row: 0,
          col: 0,
          value: { value: "x".repeat(3 * 1024 * 1024) },
        },
      ],
    });

    expect(result).toEqual({ error: "Document operation batch is too large" });
  });
});
