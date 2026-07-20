import { inventoryReconciliationDemo } from "./examples/inventory-reconciliation";
import type { DemoDefinition } from "./runtime/replayTypes";

export const demoRegistry: Record<string, DemoDefinition> = {
  [inventoryReconciliationDemo.route]: inventoryReconciliationDemo,
};

export function getDemoDefinition(pathname: string): DemoDefinition | null {
  return demoRegistry[pathname] ?? null;
}

export function getDemoDefinitionById(id: string): DemoDefinition | null {
  return Object.values(demoRegistry).find((demo) => demo.id === id) ?? null;
}
