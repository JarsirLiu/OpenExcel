import { describe, expect, it } from "vitest";
import { routePaths } from "@/app/routePaths";
import { demoCatalog, demoCatalogById } from "./catalog";
import { loadDemoDefinitionById } from "./registry";
import { validateDemoDefinition } from "./runtime/validateDemoDefinition";

describe("demo registry", () => {
  it("loads every active demo by its own route", async () => {
    for (const entry of demoCatalog) {
      const demo = await loadDemoDefinitionById(entry.id);
      expect(demo?.id).toBe(entry.id);
      expect(routePaths.demo(entry.id)).toBe(`/demos/${entry.id}`);
      expect(demo).toBeTruthy();
      if (demo) {
        expect(demo.marketing).toEqual(entry.marketing);
        expect(validateDemoDefinition(demo)).toEqual([]);
      }
    }
  });

  it("keeps the catalog lookup synchronous and exact", () => {
    expect(demoCatalogById.get("bank-transaction-audit")?.id).toBe("bank-transaction-audit");
    expect(demoCatalogById.get("student-fee-refund-analysis")).toBeUndefined();
  });

  it("does not fall back to another demo for an unknown id", async () => {
    expect(await loadDemoDefinitionById("student-fee-refund-analysis")).toBeNull();
    expect(await loadDemoDefinitionById("demo/student-fee-reconciliation")).toBeNull();
  });

  it("provides complete, uniquely ordered marketing metadata", () => {
    const demos = demoCatalog;
    expect(demos).toHaveLength(16);
    expect(new Set(demos.map((demo) => demo.marketing.featuredOrder)).size).toBe(demos.length);

    for (const demo of demos) {
      expect(demo.marketing.marketingTitle.length).toBeGreaterThan(0);
      expect(demo.marketing.summary.length).toBeGreaterThan(0);
      expect(demo.marketing.coverImage).toMatch(/^\/demo-covers\/.+\.webp$/);
      expect(demo.marketing.coverAlt.length).toBeGreaterThan(0);
      expect(demo.marketing.proofMetric.length).toBeGreaterThan(0);
      expect(demo.preview.rows.length).toBeGreaterThan(0);
    }
  });
});
