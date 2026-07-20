import { describe, expect, it } from "vitest";
import { demoRegistry, getDemoDefinition } from "./registry";

describe("demo registry", () => {
  it("registers the active inventory reconciliation demo by route", () => {
    expect(Object.keys(demoRegistry)).toEqual(["/demos/inventory-reconciliation"]);
    expect(getDemoDefinition("/demos/inventory-reconciliation")).toBe(
      demoRegistry["/demos/inventory-reconciliation"],
    );
  });

  it("does not fall back to another demo for an unknown route", () => {
    expect(getDemoDefinition("/demos/student-fee-reconciliation")).toBeNull();
  });
});
