import { describe, expect, it } from "vitest";
import { validateDemoDefinition } from "../../runtime/validateDemoDefinition";
import { logisticsOperationsAnalysisDemo } from "./definition";

describe("logisticsOperationsAnalysis demo", () => {
  it("builds a valid logistics risk diagnosis", () => {
    expect(
      logisticsOperationsAnalysisDemo.initialWorkbooks[0].sheets.map((sheet) => sheet.name),
    ).toEqual(["运单明细", "区域运力", "物流运营诊断"]);
    expect(
      logisticsOperationsAnalysisDemo.timeline.find((step) => step.id === "write-results")?.patch,
    ).toHaveLength(6);
    expect(validateDemoDefinition(logisticsOperationsAnalysisDemo)).toEqual([]);
  });
});
