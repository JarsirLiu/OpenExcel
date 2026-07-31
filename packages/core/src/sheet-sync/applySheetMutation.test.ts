import { describe, expect, it } from "vitest";
import { applySheetMutation } from "./applySheetMutation.js";
import type { SheetSnapshot } from "./sheetSnapshot.js";

const snapshot: SheetSnapshot = {
  celldata: [{ r: 0, c: 0, v: { v: "old", m: "old", bg: "#fff" } }],
  config: null,
};

describe("applySheetMutation", () => {
  it("applies a sparse patch without changing untouched cells", () => {
    const result = applySheetMutation(
      {
        celldata: [
          { r: 0, c: 0, v: { v: "old", m: "old" } },
          { r: 0, c: 1, v: { v: "keep", m: "keep" } },
        ],
        config: null,
      },
      {
        type: "patch",
        cells: [
          { row: 1, col: 1, cell: { v: "new", m: "new", f: "=1+1" } },
          { row: 1, col: 2, cell: null },
        ],
        config: { showGridLines: false },
      },
    );

    expect(result.snapshot.celldata).toEqual([
      { r: 0, c: 0, v: { v: "new", m: "new", f: "=1+1" } },
    ]);
    expect(result.snapshot.config).toEqual({ showGridLines: false });
    expect(result.changeSummary).toMatchObject({ changedCellCount: 2, operationCount: 2 });
  });

  it("applies overlapping write operations in order", () => {
    const result = applySheetMutation(
      { celldata: [], config: null },
      {
        type: "write",
        operations: [
          { type: "range", startRow: 1, startCol: 1, endRow: 2, endCol: 2, value: "first" },
          { type: "cell", row: 2, col: 2, value: "last" },
        ],
      },
    );

    expect(result.snapshot.celldata).toContainEqual({
      r: 1,
      c: 1,
      v: { v: "last", m: "last" },
    });
  });

  it("applies non-overlapping range writes as one mutation", () => {
    const result = applySheetMutation(
      { celldata: [], config: null },
      {
        type: "write",
        operations: [
          { type: "range", startRow: 1, startCol: 1, endRow: 2, endCol: 2, value: "range" },
          { type: "range", startRow: 3, startCol: 1, endRow: 3, endCol: 2, value: "cell" },
        ],
      },
    );

    expect(result.snapshot.celldata).toEqual([
      { r: 0, c: 0, v: { v: "range", m: "range" } },
      { r: 0, c: 1, v: { v: "range", m: "range" } },
      { r: 1, c: 0, v: { v: "range", m: "range" } },
      { r: 1, c: 1, v: { v: "range", m: "range" } },
      { r: 2, c: 0, v: { v: "cell", m: "cell" } },
      { r: 2, c: 1, v: { v: "cell", m: "cell" } },
    ]);
    expect(result.changeSummary).toEqual({
      changedCellCount: 6,
      changedRanges: ["A1:B3"],
      omittedRangeCount: 0,
      truncated: false,
      operationCount: 2,
    });
  });

  it("updates content while preserving formatting", () => {
    const result = applySheetMutation(snapshot, {
      type: "write",
      operations: [{ type: "range", startRow: 1, startCol: 1, endRow: 1, endCol: 1, value: "new" }],
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

  it("clears a large sparse range without iterating empty coordinates", () => {
    const result = applySheetMutation(
      {
        celldata: [
          { r: 999_999, c: 0, v: { v: "last", m: "last" } },
          { r: 1_000_001, c: 1, v: { v: "", m: "", bg: "#fff" } },
        ],
        config: null,
      },
      {
        type: "clear",
        operations: [{ type: "range", startRow: 1, startCol: 1, endRow: 1_000_000, endCol: 1 }],
      },
    );

    expect(result.snapshot.celldata).toEqual([
      { r: 1_000_001, c: 1, v: { v: "", m: "", bg: "#fff" } },
    ]);
    expect(result.changeSummary.changedCellCount).toBe(1);
  });

  it("stores date writes as Excel serials with explicit date semantics", () => {
    const result = applySheetMutation(
      {
        celldata: [{ r: 0, c: 0, v: { v: 44805, m: "2022/9/1", ct: { t: "d", fa: "m/d/yy" } } }],
        config: null,
      },
      {
        type: "write",
        operations: [
          {
            type: "range",
            startRow: 1,
            startCol: 1,
            endRow: 1,
            endCol: 1,
            value: "2023-01-15",
            valueType: "date",
          },
        ],
      },
    );

    expect(result.snapshot.celldata[0]?.v).toMatchObject({
      v: 44941,
      m: "2023-01-15",
      ct: { t: "d", fa: "m/d/yy" },
    });
  });

  it("uses a stable date format for new date cells", () => {
    const result = applySheetMutation(
      { celldata: [], config: null },
      {
        type: "write",
        operations: [
          {
            type: "range",
            startRow: 1,
            startCol: 1,
            endRow: 1,
            endCol: 1,
            value: "2022-09-01 12:30:00",
            valueType: "date",
          },
        ],
      },
    );

    expect(result.snapshot.celldata[0]?.v).toMatchObject({
      v: 44805.520833333336,
      m: "2022-09-01 12:30:00",
      ct: { t: "d", fa: "yyyy/m/d h:mm:ss" },
    });
  });

  it("writes a strict matrix without expanding the mutation contract", () => {
    const result = applySheetMutation(
      { celldata: [], config: null },
      {
        type: "write",
        operations: [
          {
            type: "range",
            startRow: 1,
            startCol: 1,
            endRow: 2,
            endCol: 2,
            values: [
              ["A", 1],
              ["B", 2],
            ],
          },
        ],
      },
    );

    expect(result.snapshot.celldata.map((cell) => cell.v.v)).toEqual(["A", 1, "B", 2]);
    expect(result.changeSummary).toEqual({
      changedCellCount: 4,
      changedRanges: ["A1:B2"],
      omittedRangeCount: 0,
      truncated: false,
      operationCount: 1,
    });
  });

  it("bounds changed ranges while preserving the complete changed-cell count", () => {
    const result = applySheetMutation(
      { celldata: [], config: null },
      {
        type: "write",
        operations: Array.from({ length: 21 }, (_, index) => ({
          type: "cell" as const,
          row: index * 2 + 1,
          col: 1,
          value: "changed",
        })),
      },
    );

    expect(result.changeSummary.changedCellCount).toBe(21);
    expect(result.changeSummary.changedRanges).toHaveLength(20);
    expect(result.changeSummary.omittedRangeCount).toBe(1);
    expect(result.changeSummary.truncated).toBe(true);
  });

  it("merges adjacent horizontal and vertical ranges", () => {
    const result = applySheetMutation(
      { celldata: [], config: null },
      {
        type: "write",
        operations: [
          { type: "range", startRow: 1, startCol: 1, endRow: 1, endCol: 4, value: "row 1" },
          { type: "range", startRow: 2, startCol: 1, endRow: 2, endCol: 4, value: "row 2" },
          { type: "range", startRow: 3, startCol: 1, endRow: 5, endCol: 1, value: "column" },
        ],
      },
    );

    expect(result.changeSummary.changedRanges).toEqual(["A1:D2", "A3:A5"]);
  });

  it("fills relative formula references across a range", () => {
    const result = applySheetMutation(
      { celldata: [], config: null },
      {
        type: "write",
        operations: [
          { type: "range", startRow: 2, startCol: 4, endRow: 4, endCol: 4, formula: "=B2*C2" },
        ],
      },
    );

    expect(result.snapshot.celldata.map((cell) => cell.v.f)).toEqual(["B2*C2", "B3*C3", "B4*C4"]);
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

    expect(formattedResult.changeSummary).toMatchObject({
      changedCellCount: 1,
      changedRanges: ["B1"],
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
