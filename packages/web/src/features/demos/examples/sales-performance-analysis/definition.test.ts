import { describe, expect, it } from "vitest";
import { validateDemoDefinition } from "../../runtime/validateDemoDefinition";
import { salesPerformanceAnalysisDemo } from "./definition";

describe("salesPerformanceAnalysis demo", () => {
  it("builds a valid regional and product sales diagnosis", () => {
    expect(
      salesPerformanceAnalysisDemo.initialWorkbooks[0].sheets.map((sheet) => sheet.name),
    ).toEqual(["区域业绩", "产品销售", "销售经营诊断"]);
    expect(
      salesPerformanceAnalysisDemo.timeline.find((step) => step.id === "write-results")?.patch,
    ).toHaveLength(6);
    expect(validateDemoDefinition(salesPerformanceAnalysisDemo)).toEqual([]);
  });
});
