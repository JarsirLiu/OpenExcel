import { bankTransactionAuditDemo } from "./examples/bank-transaction-audit";
import { financialHealthAnalysisDemo } from "./examples/financial-health-analysis";
import { inventoryReconciliationDemo } from "./examples/inventory-reconciliation";
import { investmentBudgetReviewDemo } from "./examples/investment-budget-review";
import { shareholderChangeAnalysisDemo } from "./examples/shareholder-change-analysis";
import type { DemoDefinition } from "./runtime/replayTypes";

export const demoRegistry: Record<string, DemoDefinition> = {
  [bankTransactionAuditDemo.route]: bankTransactionAuditDemo,
  [financialHealthAnalysisDemo.route]: financialHealthAnalysisDemo,
  [investmentBudgetReviewDemo.route]: investmentBudgetReviewDemo,
  [inventoryReconciliationDemo.route]: inventoryReconciliationDemo,
  [shareholderChangeAnalysisDemo.route]: shareholderChangeAnalysisDemo,
};

export function getDemoDefinition(pathname: string): DemoDefinition | null {
  return demoRegistry[pathname] ?? null;
}
