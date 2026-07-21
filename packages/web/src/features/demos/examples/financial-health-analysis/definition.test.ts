import { describe, expect, it } from "vitest";
import { validateDemoDefinition } from "../../runtime/validateDemoDefinition";
import { financialHealthAnalysisDemo } from "./definition";

describe("financialHealthAnalysis demo", () => {
  it("builds a valid profitability and solvency diagnosis", () => {
    expect(
      financialHealthAnalysisDemo.initialWorkbooks[0].sheets.map((sheet) => sheet.name),
    ).toEqual(["月度利润表", "资产负债表", "财务健康诊断"]);
    expect(
      financialHealthAnalysisDemo.timeline.find((step) => step.id === "write-results")?.patch,
    ).toHaveLength(6);
    expect(validateDemoDefinition(financialHealthAnalysisDemo)).toEqual([]);
  });
});
