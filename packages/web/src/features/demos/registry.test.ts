import { describe, expect, it } from "vitest";
import { demoRegistry, getDemoDefinition } from "./registry";

describe("demo registry", () => {
  it("registers the active demos by route", () => {
    expect(Object.keys(demoRegistry)).toEqual([
      "/demos/bank-transaction-audit",
      "/demos/inventory-reconciliation",
    ]);
    expect(getDemoDefinition("/demos/bank-transaction-audit")).toBe(
      demoRegistry["/demos/bank-transaction-audit"],
    );
    expect(getDemoDefinition("/demos/inventory-reconciliation")).toBe(
      demoRegistry["/demos/inventory-reconciliation"],
    );
  });

  it("does not fall back to another demo for an unknown route", () => {
    expect(getDemoDefinition("/demos/student-fee-reconciliation")).toBeNull();
  });
});
