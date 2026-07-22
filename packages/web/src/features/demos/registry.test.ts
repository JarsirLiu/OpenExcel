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
    expect(getDemoDefinition("/demos/student-fee-reconciliation")).toBe(
      demoRegistry["/demos/student-fee-reconciliation"],
    );
    expect(getDemoDefinition("/demos/research-fund-execution")).toBe(
      demoRegistry["/demos/research-fund-execution"],
    );
    expect(getDemoDefinition("/demos/school-procurement-audit")).toBe(
      demoRegistry["/demos/school-procurement-audit"],
    );
    expect(getDemoDefinition("/demos/department-budget-monitoring")).toBe(
      demoRegistry["/demos/department-budget-monitoring"],
    );
    expect(getDemoDefinition("/demos/student-aid-disbursement")).toBe(
      demoRegistry["/demos/student-aid-disbursement"],
    );
    for (const [route, demo] of Object.entries(demoRegistry)) {
      expect(demo.route).toBe(route);
      expect(validateDemoDefinition(demo)).toEqual([]);
    }
  });

  it("does not fall back to another demo for an unknown route", () => {
    expect(getDemoDefinition("/demos/student-fee-refund-analysis")).toBeNull();
  });

  it("provides complete, uniquely ordered marketing metadata", () => {
    const demos = Object.values(demoRegistry);
    expect(demos).toHaveLength(16);
    expect(new Set(demos.map((demo) => demo.marketing.featuredOrder)).size).toBe(demos.length);

    for (const demo of demos) {
      expect(demo.marketing.marketingTitle.length).toBeGreaterThan(0);
      expect(demo.marketing.summary.length).toBeGreaterThan(0);
      expect(demo.marketing.coverImage).toMatch(/^\/demo-covers\/.+\.webp$/);
      expect(demo.marketing.coverAlt.length).toBeGreaterThan(0);
      expect(demo.marketing.proofMetric.length).toBeGreaterThan(0);
    }
  });
});
