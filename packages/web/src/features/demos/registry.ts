import { bankTransactionAuditDemo } from "./examples/bank-transaction-audit";
import { campusRecruitmentAnalysisDemo } from "./examples/campus-recruitment-analysis";
import { examScoreAnalysisDemo } from "./examples/exam-score-analysis";
import { financialHealthAnalysisDemo } from "./examples/financial-health-analysis";
import { inventoryReconciliationDemo } from "./examples/inventory-reconciliation";
import { investmentBudgetReviewDemo } from "./examples/investment-budget-review";
import { logisticsOperationsAnalysisDemo } from "./examples/logistics-operations-analysis";
import { marketingRoiAnalysisDemo } from "./examples/marketing-roi-analysis";
import { orderFulfillmentAnalysisDemo } from "./examples/order-fulfillment-analysis";
import { researchFundExecutionDemo } from "./examples/research-fund-execution";
import { salesPerformanceAnalysisDemo } from "./examples/sales-performance-analysis";
import { schoolProcurementAuditDemo } from "./examples/school-procurement-audit";
import { shareholderChangeAnalysisDemo } from "./examples/shareholder-change-analysis";
import { studentFeeReconciliationDemo } from "./examples/student-fee-reconciliation";
import type { DemoDefinition } from "./runtime/replayTypes";

export const demoRegistry: Record<string, DemoDefinition> = {
  [bankTransactionAuditDemo.route]: bankTransactionAuditDemo,
  [campusRecruitmentAnalysisDemo.route]: campusRecruitmentAnalysisDemo,
  [examScoreAnalysisDemo.route]: examScoreAnalysisDemo,
  [financialHealthAnalysisDemo.route]: financialHealthAnalysisDemo,
  [investmentBudgetReviewDemo.route]: investmentBudgetReviewDemo,
  [inventoryReconciliationDemo.route]: inventoryReconciliationDemo,
  [logisticsOperationsAnalysisDemo.route]: logisticsOperationsAnalysisDemo,
  [marketingRoiAnalysisDemo.route]: marketingRoiAnalysisDemo,
  [orderFulfillmentAnalysisDemo.route]: orderFulfillmentAnalysisDemo,
  [researchFundExecutionDemo.route]: researchFundExecutionDemo,
  [salesPerformanceAnalysisDemo.route]: salesPerformanceAnalysisDemo,
  [schoolProcurementAuditDemo.route]: schoolProcurementAuditDemo,
  [shareholderChangeAnalysisDemo.route]: shareholderChangeAnalysisDemo,
  [studentFeeReconciliationDemo.route]: studentFeeReconciliationDemo,
};

export function getDemoDefinition(pathname: string): DemoDefinition | null {
  return demoRegistry[pathname] ?? null;
}
