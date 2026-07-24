import { describe, expect, it } from "vitest";
import { calculateTooltipShiftX } from "./fortuneSheetTooltip";

describe("calculateTooltipShiftX", () => {
  it("moves a tooltip back inside the right viewport edge", () => {
    expect(calculateTooltipShiftX({ left: 446, right: 564 }, 480)).toBe(-92);
  });

  it("moves a tooltip forward when it crosses the left viewport edge", () => {
    expect(calculateTooltipShiftX({ left: -12, right: 80 }, 480)).toBe(20);
  });

  it("does not move a tooltip that already fits", () => {
    expect(calculateTooltipShiftX({ left: 120, right: 240 }, 480)).toBe(0);
  });
});
