import { describe, expect, it } from "vitest";
import { demoRegistry, getDemoDefinition } from "./registry";
import { validateDemoDefinition } from "./runtime/validateDemoDefinition";

describe("demo registry", () => {
  it("registers every active demo by its own route", () => {
    expect(getDemoDefinition("/demos/bank-transaction-audit")).toBe(
      demoRegistry["/demos/bank-transaction-audit"],
    );
    expect(getDemoDefinition("/demos/investment-budget-review")).toBe(
      demoRegistry["/demos/investment-budget-review"],
    );
    expect(getDemoDefinition("/demos/inventory-reconciliation")).toBe(
      demoRegistry["/demos/inventory-reconciliation"],
    );
    for (const [route, demo] of Object.entries(demoRegistry)) {
      expect(demo.route).toBe(route);
      expect(validateDemoDefinition(demo)).toEqual([]);
    }
  });

  it("does not fall back to another demo for an unknown route", () => {
    expect(getDemoDefinition("/demos/student-fee-reconciliation")).toBeNull();
  });
});
