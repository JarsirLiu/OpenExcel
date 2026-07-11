import { describe, expect, it } from "vitest";
import { getChunkKey, getChunkPosition, getChunkRange } from "./chunk.js";

describe("document chunks", () => {
  it("maps cells to stable chunk coordinates", () => {
    expect(getChunkPosition(129, 65)).toEqual({
      rowBlock: 1,
      colBlock: 1,
      rowOffset: 1,
      colOffset: 1,
    });
    expect(getChunkKey(1, 1)).toBe("1:1");
  });

  it("returns the physical range covered by a chunk", () => {
    expect(getChunkRange(2, 3, { rowSize: 10, columnSize: 5 })).toEqual({
      startRow: 20,
      startCol: 15,
      endRow: 29,
      endCol: 19,
    });
  });
});
