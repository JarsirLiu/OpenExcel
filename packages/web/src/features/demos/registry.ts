import { bankTransactionAuditDemo } from "./examples/bank-transaction-audit";
import { financialHealthAnalysisDemo } from "./examples/financial-health-analysis";
import { inventoryReconciliationDemo } from "./examples/inventory-reconciliation";
import { investmentBudgetReviewDemo } from "./examples/investment-budget-review";
import type { DemoDefinition } from "./runtime/replayTypes";

export const demoRegistry: Record<string, DemoDefinition> = {
  [bankTransactionAuditDemo.route]: bankTransactionAuditDemo,
  [financialHealthAnalysisDemo.route]: financialHealthAnalysisDemo,
  [investmentBudgetReviewDemo.route]: investmentBudgetReviewDemo,
  [inventoryReconciliationDemo.route]: inventoryReconciliationDemo,
};

export function getDemoDefinition(pathname: string): DemoDefinition | null {
  return demoRegistry[pathname] ?? null;
}
