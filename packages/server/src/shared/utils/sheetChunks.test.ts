import { describe, expect, it } from "vitest";
import { mutationChunkRanges, parseSheetChunkPayload } from "./sheetChunks.js";

describe("mutationChunkRanges", () => {
  it("represents a large continuous range as one chunk rectangle", () => {
    expect(
      mutationChunkRanges({
        type: "clear",
        operations: [{ type: "range", startRow: 1, startCol: 1, endRow: 100_000, endCol: 100_000 }],
      }),
    ).toEqual([{ chunkRow: 0, chunkCol: 0, endChunkRow: 390, endChunkCol: 390 }]);
  });

  it("coalesces sparse patch cells into contiguous chunk rectangles", () => {
    expect(
      mutationChunkRanges({
        type: "patch",
        cells: [
          { row: 1, col: 1, cell: { v: "a" } },
          { row: 1, col: 257, cell: { v: "b" } },
          { row: 257, col: 1, cell: { v: "c" } },
          { row: 257, col: 257, cell: { v: "d" } },
        ],
      }),
    ).toEqual([{ chunkRow: 0, chunkCol: 0, endChunkRow: 1, endChunkCol: 1 }]);
  });
});

describe("parseSheetChunkPayload", () => {
  it("fails instead of treating a malformed chunk as empty", () => {
    expect(() => parseSheetChunkPayload("not-json")).toThrow();
    expect(() => parseSheetChunkPayload(JSON.stringify({}))).toThrow("celldata must be an array");
  });
});
