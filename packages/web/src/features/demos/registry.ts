import { bankTransactionAuditDemo } from "./examples/bank-transaction-audit";
import { campusRecruitmentAnalysisDemo } from "./examples/campus-recruitment-analysis";
import { financialHealthAnalysisDemo } from "./examples/financial-health-analysis";
import { inventoryReconciliationDemo } from "./examples/inventory-reconciliation";
import { investmentBudgetReviewDemo } from "./examples/investment-budget-review";
import { orderFulfillmentAnalysisDemo } from "./examples/order-fulfillment-analysis";
import { salesPerformanceAnalysisDemo } from "./examples/sales-performance-analysis";
import { shareholderChangeAnalysisDemo } from "./examples/shareholder-change-analysis";
import type { DemoDefinition } from "./runtime/replayTypes";

export const demoRegistry: Record<string, DemoDefinition> = {
  [bankTransactionAuditDemo.route]: bankTransactionAuditDemo,
  [campusRecruitmentAnalysisDemo.route]: campusRecruitmentAnalysisDemo,
  [financialHealthAnalysisDemo.route]: financialHealthAnalysisDemo,
  [investmentBudgetReviewDemo.route]: investmentBudgetReviewDemo,
  [inventoryReconciliationDemo.route]: inventoryReconciliationDemo,
  [orderFulfillmentAnalysisDemo.route]: orderFulfillmentAnalysisDemo,
  [salesPerformanceAnalysisDemo.route]: salesPerformanceAnalysisDemo,
  [shareholderChangeAnalysisDemo.route]: shareholderChangeAnalysisDemo,
};

export function getDemoDefinition(pathname: string): DemoDefinition | null {
  return demoRegistry[pathname] ?? null;
}
