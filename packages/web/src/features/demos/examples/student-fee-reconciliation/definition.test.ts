import { describe, expect, it } from "vitest";
import { validateDemoDefinition } from "../../runtime/validateDemoDefinition";
import { studentFeeReconciliationDemo } from "./definition";

describe("studentFeeReconciliation demo", () => {
  it("builds a valid student fee reconciliation replay", () => {
    expect(
      studentFeeReconciliationDemo.initialWorkbooks[0].sheets.map((sheet) => sheet.name),
    ).toEqual(["学生收费名册", "收费标准", "缴费流水", "减免退费", "收费核查结果"]);
    expect(
      studentFeeReconciliationDemo.timeline.find((step) => step.id === "write-results")?.patch,
    ).toHaveLength(9);
    expect(validateDemoDefinition(studentFeeReconciliationDemo)).toEqual([]);
  });
});
