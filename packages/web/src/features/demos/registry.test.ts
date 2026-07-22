import { describe, expect, it } from "vitest";
import { routePaths } from "@/app/routePaths";
import { demoRegistry, getDemoDefinition } from "./registry";
import { validateDemoDefinition } from "./runtime/validateDemoDefinition";

describe("demo registry", () => {
  it("registers every active demo by its own route", () => {
    for (const demo of Object.values(demoRegistry)) {
      expect(getDemoDefinition(routePaths.demo(demo.id))).toBe(demo);
      expect(validateDemoDefinition(demo)).toEqual([]);
    }
  });

  it("does not fall back to another demo for an unknown route", () => {
    expect(getDemoDefinition("/demos/student-fee-refund-analysis")).toBeNull();
    expect(getDemoDefinition("/demo/student-fee-reconciliation")).toBeNull();
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
