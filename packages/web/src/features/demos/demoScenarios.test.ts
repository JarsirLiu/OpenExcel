import { describe, expect, it } from "vitest";
import { demoScenarios, getDemoScenario } from "./demoScenarios";

describe("demo scenarios", () => {
  it("keeps only the active inventory reconciliation scenario registered", () => {
    expect(Object.keys(demoScenarios)).toEqual(["inventory"]);
    expect(getDemoScenario("/demos/inventory-reconciliation")).toBe(demoScenarios.inventory);
    expect(getDemoScenario("/demos/student-fee-reconciliation")).toBe(demoScenarios.inventory);
  });
});
