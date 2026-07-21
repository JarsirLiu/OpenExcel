import { describe, expect, it } from "vitest";
import { validateDemoDefinition } from "../../runtime/validateDemoDefinition";
import { marketingRoiAnalysisDemo } from "./definition";

describe("marketingRoiAnalysis demo", () => {
  it("builds a valid channel ROI optimization replay", () => {
    expect(marketingRoiAnalysisDemo.initialWorkbooks[0].sheets.map((sheet) => sheet.name)).toEqual([
      "本月投放",
      "上月ROI",
      "投放优化清单",
    ]);
    expect(
      marketingRoiAnalysisDemo.timeline.find((step) => step.id === "write-results")?.patch,
    ).toHaveLength(5);
    expect(validateDemoDefinition(marketingRoiAnalysisDemo)).toEqual([]);
  });
});
