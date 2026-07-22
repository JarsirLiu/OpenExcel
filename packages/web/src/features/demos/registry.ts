import { bankTransactionAuditDemo } from "./examples/bank-transaction-audit";
import { campusRecruitmentAnalysisDemo } from "./examples/campus-recruitment-analysis";
import { departmentBudgetMonitoringDemo } from "./examples/department-budget-monitoring";
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
import { studentAidDisbursementDemo } from "./examples/student-aid-disbursement";
import { studentFeeReconciliationDemo } from "./examples/student-fee-reconciliation";
import type { DemoDefinition } from "./runtime/replayTypes";

export const demoRegistry: Record<string, DemoDefinition> = {
  [bankTransactionAuditDemo.id]: bankTransactionAuditDemo,
  [campusRecruitmentAnalysisDemo.id]: campusRecruitmentAnalysisDemo,
  [departmentBudgetMonitoringDemo.id]: departmentBudgetMonitoringDemo,
  [examScoreAnalysisDemo.id]: examScoreAnalysisDemo,
  [financialHealthAnalysisDemo.id]: financialHealthAnalysisDemo,
  [investmentBudgetReviewDemo.id]: investmentBudgetReviewDemo,
  [inventoryReconciliationDemo.id]: inventoryReconciliationDemo,
  [logisticsOperationsAnalysisDemo.id]: logisticsOperationsAnalysisDemo,
  [marketingRoiAnalysisDemo.id]: marketingRoiAnalysisDemo,
  [orderFulfillmentAnalysisDemo.id]: orderFulfillmentAnalysisDemo,
  [researchFundExecutionDemo.id]: researchFundExecutionDemo,
  [salesPerformanceAnalysisDemo.id]: salesPerformanceAnalysisDemo,
  [schoolProcurementAuditDemo.id]: schoolProcurementAuditDemo,
  [shareholderChangeAnalysisDemo.id]: shareholderChangeAnalysisDemo,
  [studentAidDisbursementDemo.id]: studentAidDisbursementDemo,
  [studentFeeReconciliationDemo.id]: studentFeeReconciliationDemo,
};

export function getDemoDefinition(pathname: string): DemoDefinition | null {
  const prefix = "/demos/";
  if (!pathname.startsWith(prefix)) return null;
  return getDemoDefinitionById(pathname.slice(prefix.length));
}

export function getDemoDefinitionById(id: string): DemoDefinition | null {
  return Object.values(demoRegistry).find((demo) => demo.id === id) ?? null;
}
