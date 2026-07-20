import { describe, expect, it } from "vitest";
import { validateDemoDefinition } from "../../runtime/validateDemoDefinition";
import { campusRecruitmentAnalysisDemo } from "./definition";

describe("campusRecruitmentAnalysis demo", () => {
  it("builds a valid channel funnel and hiring gap diagnosis", () => {
    expect(
      campusRecruitmentAnalysisDemo.initialWorkbooks[0].sheets.map((sheet) => sheet.name),
    ).toEqual(["渠道漏斗", "岗位需求", "校招诊断"]);
    expect(
      campusRecruitmentAnalysisDemo.timeline.find((step) => step.id === "write-results")?.patch,
    ).toHaveLength(7);
    expect(validateDemoDefinition(campusRecruitmentAnalysisDemo)).toEqual([]);
  });
});
