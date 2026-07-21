import { describe, expect, it } from "vitest";
import { validateDemoDefinition } from "../../runtime/validateDemoDefinition";
import { investmentBudgetReviewDemo } from "./definition";

describe("investmentBudgetReview demo", () => {
  it("provides a valid multi-sheet investment review replay", () => {
    expect(
      investmentBudgetReviewDemo.initialWorkbooks[0].sheets.map((sheet) => sheet.name),
    ).toEqual(["投资估算", "资金来源", "核算复核"]);
    expect(
      investmentBudgetReviewDemo.timeline.find((step) => step.id === "write-results")?.patch,
    ).toHaveLength(7);
    expect(validateDemoDefinition(investmentBudgetReviewDemo)).toEqual([]);
  });
});
