import { describe, expect, it } from "vitest";
import { validateDemoDefinition } from "../../runtime/validateDemoDefinition";
import { orderFulfillmentAnalysisDemo } from "./definition";

describe("orderFulfillmentAnalysis demo", () => {
  it("builds a valid order fulfillment risk replay", () => {
    expect(
      orderFulfillmentAnalysisDemo.initialWorkbooks[0].sheets.map((sheet) => sheet.name),
    ).toEqual(["订单台账", "客户信用", "订单风险清单"]);
    expect(
      orderFulfillmentAnalysisDemo.timeline.find((step) => step.id === "write-results")?.patch,
    ).toHaveLength(5);
    expect(validateDemoDefinition(orderFulfillmentAnalysisDemo)).toEqual([]);
  });
});
