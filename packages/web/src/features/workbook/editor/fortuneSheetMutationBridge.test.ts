import { describe, expect, it } from "vitest";
import { planFortuneSheetMutation } from "./fortuneSheetMutationBridge";

describe("planFortuneSheetMutation", () => {
  it("targets the committed sheet when batching cell writes", () => {
    const plan = planFortuneSheetMutation(
      {
        id: 60,
        sheetNo: 1,
        name: "Sheet1",
        order: 0,
        columns: [],
        merges: [],
        uploadedData: [{ r: 0, c: 0, v: { v: 90, m: "90" } }],
        config: null,
        revision: 3,
      },
      {
        type: "patch",
        cells: [{ row: 1, col: 1, cell: { v: 9, m: "9" } }],
      },
    );

    expect(plan.apiCalls).toEqual([
      {
        name: "setCellValue",
        args: [0, 0, { v: 9, m: "9" }, null, { id: "60" }],
      },
      { name: "calculateFormula", args: [] },
    ]);
  });

  it("uses the core batch API signature for write mutations", () => {
    const plan = planFortuneSheetMutation(
      {
        id: 60,
        sheetNo: 1,
        name: "Sheet1",
        order: 0,
        columns: [],
        merges: [],
        uploadedData: [],
        config: null,
        revision: 3,
      },
      {
        type: "write",
        operations: [{ type: "cell", row: 1, col: 1, value: "new" }],
      },
    );

    expect(plan.apiCalls).toEqual([
      {
        name: "setCellValue",
        args: [0, 0, { v: "new", m: "new" }, null, { id: "60" }],
      },
      { name: "calculateFormula", args: [] },
    ]);
  });

  it("uses FortuneSheet merge APIs instead of writing merge metadata as cell values", () => {
    const plan = planFortuneSheetMutation(
      {
        id: 60,
        sheetNo: 1,
        name: "Sheet1",
        order: 0,
        columns: [],
        merges: [],
        uploadedData: [{ r: 0, c: 0, v: { v: "header", m: "header" } }],
        config: null,
        revision: 3,
      },
      {
        type: "merge",
        operations: [{ type: "range", startRow: 1, startCol: 1, endRow: 1, endCol: 2 }],
      },
    );

    expect(plan.apiCalls).toEqual([
      {
        name: "mergeCells",
        args: [[{ row: [0, 0], column: [0, 1] }], "all", { id: "60" }],
      },
      { name: "calculateFormula", args: [] },
    ]);
  });

  it("uses the native cancelMerge API for unmerge mutations", () => {
    const plan = planFortuneSheetMutation(
      {
        id: 60,
        sheetNo: 1,
        name: "Sheet1",
        order: 0,
        columns: [],
        merges: [],
        uploadedData: [
          { r: 0, c: 0, v: { v: "header", m: "header", mc: { r: 0, c: 0, rs: 1, cs: 2 } } },
          { r: 0, c: 1, v: { mc: { r: 0, c: 0, rs: 1, cs: 2 } } },
        ],
        config: { merge: { A1: { r: 0, c: 0, rs: 1, cs: 2 } } },
        revision: 3,
      },
      {
        type: "unmerge",
        operations: [{ type: "range", startRow: 1, startCol: 1, endRow: 1, endCol: 2 }],
      },
    );

    expect(plan.apiCalls).toEqual([
      {
        name: "cancelMerge",
        args: [[{ row: [0, 0], column: [0, 1] }], { id: "60" }],
      },
      { name: "calculateFormula", args: [] },
    ]);
  });

  it("uses FortuneSheet's native format API for color mutations", () => {
    const plan = planFortuneSheetMutation(
      {
        id: 60,
        sheetNo: 1,
        name: "Sheet1",
        order: 0,
        columns: [],
        merges: [],
        uploadedData: [{ r: 0, c: 0, v: { v: "value", m: "value" } }],
        config: null,
        revision: 3,
      },
      {
        type: "format",
        operations: [
          { type: "range", startRow: 1, startCol: 1, endRow: 1, endCol: 1, fill: "yellow" },
          { type: "range", startRow: 1, startCol: 1, endRow: 1, endCol: 1, fontColor: null },
        ],
      },
    );

    expect(plan.apiCalls).toEqual([
      { name: "setCellFormat", args: [0, 0, "bg", "#FFFF00", { id: "60" }] },
      { name: "setCellFormat", args: [0, 0, "fc", null, { id: "60" }] },
      { name: "calculateFormula", args: [] },
    ]);
  });
});
