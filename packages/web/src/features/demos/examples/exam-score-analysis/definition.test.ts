import { describe, expect, it } from "vitest";
import { validateDemoDefinition } from "../../runtime/validateDemoDefinition";
import { examScoreAnalysisDemo } from "./definition";

describe("examScoreAnalysis demo", () => {
  it("builds a valid three-exam student diagnosis", () => {
    expect(examScoreAnalysisDemo.initialWorkbooks[0].sheets.map((sheet) => sheet.name)).toEqual([
      "第一次月考",
      "期中考试",
      "期末考试",
      "个性化诊断",
    ]);
    expect(
      examScoreAnalysisDemo.timeline.find((step) => step.id === "write-results")?.patch,
    ).toHaveLength(6);
    expect(validateDemoDefinition(examScoreAnalysisDemo)).toEqual([]);
  });
});
