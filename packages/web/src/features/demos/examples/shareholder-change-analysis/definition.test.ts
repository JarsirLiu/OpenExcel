import { describe, expect, it } from "vitest";
import { validateDemoDefinition } from "../../runtime/validateDemoDefinition";
import { shareholderChangeAnalysisDemo } from "./definition";

describe("shareholderChangeAnalysis demo", () => {
  it("builds a valid cross-quarter shareholder comparison", () => {
    expect(
      shareholderChangeAnalysisDemo.initialWorkbooks[0].sheets.map((sheet) => sheet.name),
    ).toEqual(["2026Q1股东", "2026Q2股东", "股东变动明细"]);
    expect(
      shareholderChangeAnalysisDemo.timeline.find((step) => step.id === "write-results")?.patch,
    ).toHaveLength(6);
    expect(validateDemoDefinition(shareholderChangeAnalysisDemo)).toEqual([]);
  });
});
