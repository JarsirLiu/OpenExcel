import { bankTransactionAuditDemo } from "./examples/bank-transaction-audit";
import { inventoryReconciliationDemo } from "./examples/inventory-reconciliation";
import type { DemoDefinition } from "./runtime/replayTypes";

export const demoRegistry: Record<string, DemoDefinition> = {
  [bankTransactionAuditDemo.route]: bankTransactionAuditDemo,
  [inventoryReconciliationDemo.route]: inventoryReconciliationDemo,
};

export function getDemoDefinition(pathname: string): DemoDefinition | null {
  return demoRegistry[pathname] ?? null;
}
