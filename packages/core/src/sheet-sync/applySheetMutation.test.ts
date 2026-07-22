import { describe, expect, it } from "vitest";
import { applySheetMutation } from "./applySheetMutation.js";
import type { SheetSnapshot } from "./sheetSnapshot.js";

const snapshot: SheetSnapshot = {
  celldata: [{ r: 0, c: 0, v: { v: "old", m: "old", bg: "#fff" } }],
  config: null,
};

describe("applySheetMutation", () => {
  it("updates content while preserving formatting", () => {
    const result = applySheetMutation(snapshot, {
      type: "write",
      cells: [{ row: 1, col: 1, value: "new" }],
    });

    expect(result.snapshot.celldata).toEqual([
      { r: 0, c: 0, v: { v: "new", m: "new", bg: "#fff" } },
    ]);
    expect(result.changeSummary.changedCellCount).toBe(1);
  });

  it("clears content without removing formatting", () => {
    const result = applySheetMutation(snapshot, {
      type: "clear",
      operations: [{ type: "cell", row: 1, col: 1 }],
    });

    expect(result.snapshot.celldata).toEqual([{ r: 0, c: 0, v: { bg: "#fff" } }]);
  });

  it("applies merge state to both cells and config", () => {
    const mergeSnapshot: SheetSnapshot = {
      celldata: [
        {
          r: 0,
          c: 0,
          v: { v: "anchor", m: "anchor", bg: "#fff" },
        },
        {
          r: 0,
          c: 1,
          v: {
            v: "discarded content",
            m: "discarded content",
            f: "=A1",
            fc: "#f00",
            bd: { r: { s: 1, c: "#000" } },
          },
        },
      ],
      config: null,
    };
    const result = applySheetMutation(snapshot, {
      type: "merge",
      operations: [{ type: "range", startRow: 1, startCol: 1, endRow: 1, endCol: 2 }],
    });

    expect(result.snapshot.celldata).toEqual([
      { r: 0, c: 0, v: { v: "old", m: "old", bg: "#fff", mc: { r: 0, c: 0, rs: 1, cs: 2 } } },
      { r: 0, c: 1, v: { mc: { r: 0, c: 0, rs: 1, cs: 2 } } },
    ]);
    expect(result.snapshot.config).toEqual({ merge: { A1: { r: 0, c: 0, rs: 1, cs: 2 } } });

    const formattedResult = applySheetMutation(mergeSnapshot, {
      type: "merge",
      operations: [{ type: "range", startRow: 1, startCol: 1, endRow: 1, endCol: 2 }],
    });

    expect(formattedResult.snapshot.celldata).toEqual([
      {
        r: 0,
        c: 0,
        v: { v: "anchor", m: "anchor", bg: "#fff", mc: { r: 0, c: 0, rs: 1, cs: 2 } },
      },
      {
        r: 0,
        c: 1,
        v: { fc: "#f00", bd: { r: { s: 1, c: "#000" } }, mc: { r: 0, c: 0, rs: 1, cs: 2 } },
      },
    ]);

    const unmergedResult = applySheetMutation(formattedResult.snapshot, {
      type: "unmerge",
      operations: [{ type: "range", startRow: 1, startCol: 1, endRow: 1, endCol: 2 }],
    });

    expect(unmergedResult.snapshot.celldata).toEqual([
      { r: 0, c: 0, v: { v: "anchor", m: "anchor", bg: "#fff" } },
      { r: 0, c: 1, v: { fc: "#f00", bd: { r: { s: 1, c: "#000" } } } },
    ]);
    expect(unmergedResult.snapshot.config).toBeNull();
  });
});
