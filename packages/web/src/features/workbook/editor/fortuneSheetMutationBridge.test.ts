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
});
