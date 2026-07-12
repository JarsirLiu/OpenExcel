import { describe, expect, it } from "vitest";
import type { DocumentRangeResult } from "@/api/documents";
import {
  createViewportCache,
  expandRangeToChunks,
  mergeDocumentRange,
  missingChunksForRange,
  viewportCelldata,
  viewportRangeFromScroll,
} from "./viewportCache";

describe("viewportCache", () => {
  it("aligns requests to canonical chunk boundaries", () => {
    expect(expandRangeToChunks({ startRow: 130, startCol: 65, endRow: 140, endCol: 70 })).toEqual({
      startRow: 128,
      startCol: 64,
      endRow: 255,
      endCol: 127,
    });
  });

  it("only reports chunks that have not been loaded", () => {
    const cache = createViewportCache();
    const range = { startRow: 0, startCol: 0, endRow: 128, endCol: 0 };
    cache.loadedChunks.add("0:0");
    expect(missingChunksForRange(cache, range)).toEqual(["1:0"]);
  });

  it("merges canonical cells and restores renderer row offsets", () => {
    const cache = createViewportCache();
    const result: DocumentRangeResult = {
      sheetId: 1,
      format: "openexcel-document-v1",
      version: 1,
      revision: 4,
      maxRow: 3,
      maxColumn: 2,
      range: { startRow: 0, startCol: 0, endRow: 127, endCol: 63 },
      cells: [{ row: 0, col: 0, value: { value: "A", displayValue: "A" } }],
      objects: [
        {
          id: "merge:0:0:1:1",
          type: "custom",
          position: { startRow: 0, startCol: 0, endRow: 1, endCol: 1 },
          data: { kind: "merge" },
        },
      ],
    };

    mergeDocumentRange(cache, result, [{ label: "Header" }]);

    expect(viewportCelldata(cache)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ r: 0, c: 0 }),
        expect.objectContaining({ r: 1, c: 0, v: expect.objectContaining({ v: "A" }) }),
        expect.objectContaining({ r: 2, c: 1 }),
      ]),
    );
    expect(cache.loadedChunks.has("0:0")).toBe(true);
  });

  it("prefetches a bounded range around the scroll position", () => {
    const range = viewportRangeFromScroll(19 * 500, 100 * 40, 10_000, 2_000);
    expect(range.startRow).toBe(384);
    expect(range.startCol).toBe(0);
    expect(range.endRow).toBe(639);
    expect(range.endCol).toBe(127);
  });
});
