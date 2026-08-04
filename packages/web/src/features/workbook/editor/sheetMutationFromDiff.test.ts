import type { FortuneCell } from "@openexcel/core";
import { describe, expect, it } from "vitest";
import {
  createSheetEditorSnapshot,
  sheetMutationFromDiff,
  updateSheetEditorSnapshotFromMatrix,
} from "./sheetMutationFromDiff";

describe("sheetMutationFromDiff", () => {
  it("returns only changed cells and config", () => {
    const before: FortuneCell[] = [
      { r: 0, c: 0, v: { v: "old", m: "old" } },
      { r: 0, c: 1, v: { v: "keep", m: "keep" } },
    ];
    const after: FortuneCell[] = [
      { r: 0, c: 0, v: { v: "new", m: "new" } },
      { r: 0, c: 1, v: { v: "keep", m: "keep" } },
    ];

    expect(sheetMutationFromDiff(before, after, null, { showGridLines: false })).toEqual({
      type: "patch",
      cells: [{ row: 1, col: 1, cell: { v: "new", m: "new" } }],
      config: { showGridLines: false },
    });
  });

  it("returns null when the sheet is unchanged", () => {
    const cells: FortuneCell[] = [{ r: 0, c: 0, v: { v: "same", m: "same" } }];

    expect(sheetMutationFromDiff(cells, cells, null, null)).toBeNull();
  });

  it("persists a recalculated formula cell together with its cached value", () => {
    const before: FortuneCell[] = [
      { r: 0, c: 0, v: { v: 1, m: "1" } },
      { r: 0, c: 1, v: { v: 3, m: "3" } },
      { r: 0, c: 2, v: { v: 4, m: "4", f: "=SUM(A1:B1)" } },
    ];
    const after: FortuneCell[] = [
      { r: 0, c: 0, v: { v: 2, m: "2" } },
      { r: 0, c: 1, v: { v: 3, m: "3" } },
      { r: 0, c: 2, v: { v: 5, m: "5", f: "=SUM(A1:B1)" } },
    ];

    expect(sheetMutationFromDiff(before, after, null, null)).toEqual({
      type: "patch",
      cells: [
        { row: 1, col: 1, cell: { v: 2, m: "2" } },
        { row: 1, col: 3, cell: { v: 5, m: "5", f: "=SUM(A1:B1)" } },
      ],
    });
  });

  it("persists formatting changes even when the cell value is unchanged", () => {
    const before: FortuneCell[] = [{ r: 0, c: 0, v: { v: "OpenExcel", m: "OpenExcel" } }];
    const after: FortuneCell[] = [
      {
        r: 0,
        c: 0,
        v: { v: "OpenExcel", m: "OpenExcel", bg: "#fff2cc", fc: "#1f4e78", un: 1 },
      },
    ];

    expect(sheetMutationFromDiff(before, after, null, null)).toEqual({
      type: "patch",
      cells: [
        {
          row: 1,
          col: 1,
          cell: { v: "OpenExcel", m: "OpenExcel", bg: "#fff2cc", fc: "#1f4e78", un: 1 },
        },
      ],
    });
  });

  it("diffs the post-calculation matrix without losing zero, false, empty, or formatting values", () => {
    const previous = createSheetEditorSnapshot(
      [
        { r: 0, c: 0, v: { v: 90, m: "90" } },
        { r: 0, c: 1, v: { v: true, m: "TRUE" } },
        { r: 0, c: 2, v: { v: "old", m: "old" } },
      ],
      null,
    );

    const result = updateSheetEditorSnapshotFromMatrix(
      previous,
      [
        [
          { v: 9, m: "9" },
          { v: false, m: "FALSE", un: 1 },
          { v: "", m: "" },
        ],
      ],
      null,
    );

    expect(result.mutation).toEqual({
      type: "patch",
      cells: [
        { row: 1, col: 1, cell: { v: 9, m: "9" } },
        { row: 1, col: 2, cell: { v: false, m: "FALSE", un: 1 } },
        { row: 1, col: 3, cell: { v: "", m: "" } },
      ],
    });
  });

  it("reports cells removed from the matrix as deletions", () => {
    const previous = createSheetEditorSnapshot(
      [{ r: 1, c: 0, v: { v: "remove", m: "remove" } }],
      null,
    );

    const result = updateSheetEditorSnapshotFromMatrix(previous, [[], []], null);

    expect(result.mutation).toEqual({
      type: "patch",
      cells: [{ row: 2, col: 1, cell: null }],
    });
  });

  it("captures recalculated formula caches from the matrix", () => {
    const previous = createSheetEditorSnapshot(
      [
        { r: 0, c: 0, v: { v: 90, m: "90" } },
        { r: 0, c: 1, v: { v: 90, m: "90", f: "=SUM(A1:A1)" } },
      ],
      null,
    );

    const result = updateSheetEditorSnapshotFromMatrix(
      previous,
      [
        [
          { v: 9, m: "9" },
          { v: 9, m: "9", f: "=SUM(A1:A1)" },
        ],
      ],
      null,
    );

    expect(result.mutation).toEqual({
      type: "patch",
      cells: [
        { row: 1, col: 1, cell: { v: 9, m: "9" } },
        { row: 1, col: 2, cell: { v: 9, m: "9" } },
      ],
    });
  });

  it("keeps imported styles when a value callback omits them", () => {
    const previous = createSheetEditorSnapshot(
      [
        {
          r: 0,
          c: 0,
          v: {
            v: "old",
            m: "old",
            bd: { b: { s: 1, c: "#000" } },
            ct: { fa: "0.00" },
            bg: "#fff2cc",
          },
        },
      ],
      { config: { columnlen: { 0: 180 } }, borderInfo: [{ rangeType: "cell" }] } as never,
    );

    const result = updateSheetEditorSnapshotFromMatrix(
      previous,
      [[{ v: "new", m: "new" }]],
      previous.config,
      new Set(["0,0"]),
      new Map([["0,0", new Set(["v", "m"])]]),
    );

    expect(result.mutation).toEqual({
      type: "patch",
      cells: [{ row: 1, col: 1, cell: { v: "new", m: "new" } }],
    });
    expect(result.snapshot.cellsByKey.get("0,0")?.v).toEqual({
      v: "new",
      m: "new",
      bd: { b: { s: 1, c: "#000" } },
      ct: { fa: "0.00" },
      bg: "#fff2cc",
    });
  });

  it("uses explicit operation fields to remove a cleared style", () => {
    const previous = createSheetEditorSnapshot(
      [{ r: 0, c: 0, v: { v: "value", m: "value", bg: "#fff2cc", fc: "#000" } }],
      null,
    );

    const result = updateSheetEditorSnapshotFromMatrix(
      previous,
      [[{ v: "value", m: "value", fc: "#000" }]],
      null,
      new Set(["0,0"]),
      new Map([["0,0", new Set(["bg"])]]),
    );

    expect(result.mutation).toEqual({
      type: "patch",
      cells: [{ row: 1, col: 1, cell: {}, removed: ["bg"] }],
    });
  });
});
