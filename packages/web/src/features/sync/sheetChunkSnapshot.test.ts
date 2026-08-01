import { describe, expect, it } from "vitest";
import { changedSheetChunks, serializeSheetChunkSnapshot } from "./sheetChunkSnapshot";

describe("sheetChunkSnapshot", () => {
  it("includes a recalculated formula in the changed chunk", () => {
    const before = serializeSheetChunkSnapshot([
      { r: 0, c: 0, v: { v: 90, m: "90" } },
      { r: 0, c: 1, v: { v: 90, m: "90", f: "=SUM(A1:A1)" } },
    ]);
    const after = serializeSheetChunkSnapshot([
      { r: 0, c: 0, v: { v: 9, m: "9" } },
      { r: 0, c: 1, v: { v: 9, m: "9", f: "=SUM(A1:A1)" } },
    ]);

    expect(changedSheetChunks(before, after)).toHaveLength(1);
    expect(changedSheetChunks(before, after)[0]?.payload).toContain('"f":"=SUM(A1:A1)"');
  });

  it("uses a deletion marker when the last cell in a chunk is cleared", () => {
    const before = serializeSheetChunkSnapshot([{ r: 0, c: 0, v: { v: 1, m: "1" } }]);
    const after = serializeSheetChunkSnapshot([]);

    expect(changedSheetChunks(before, after)).toEqual([
      { chunkRow: 0, chunkCol: 0, payload: null },
    ]);
  });
});
