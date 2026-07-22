import type { DemoDefinition } from "./runtime/replayTypes";

type DemoLoader = () => Promise<DemoDefinition>;

const demoLoaders: Record<string, DemoLoader> = {
  "bank-transaction-audit": () =>
    import("./examples/bank-transaction-audit").then(({ bankTransactionAuditDemo }) => bankTransactionAuditDemo),
  "campus-recruitment-analysis": () =>
    import("./examples/campus-recruitment-analysis").then(
      ({ campusRecruitmentAnalysisDemo }) => campusRecruitmentAnalysisDemo,
    ),
  "department-budget-monitoring": () =>
    import("./examples/department-budget-monitoring").then(
      ({ departmentBudgetMonitoringDemo }) => departmentBudgetMonitoringDemo,
    ),
  "exam-score-analysis": () =>
    import("./examples/exam-score-analysis").then(({ examScoreAnalysisDemo }) => examScoreAnalysisDemo),
  "financial-health-analysis": () =>
    import("./examples/financial-health-analysis").then(
      ({ financialHealthAnalysisDemo }) => financialHealthAnalysisDemo,
    ),
  "inventory-reconciliation": () =>
    import("./examples/inventory-reconciliation").then(
      ({ inventoryReconciliationDemo }) => inventoryReconciliationDemo,
    ),
  "investment-budget-review": () =>
    import("./examples/investment-budget-review").then(
      ({ investmentBudgetReviewDemo }) => investmentBudgetReviewDemo,
    ),
  "logistics-operations-analysis": () =>
    import("./examples/logistics-operations-analysis").then(
      ({ logisticsOperationsAnalysisDemo }) => logisticsOperationsAnalysisDemo,
    ),
  "marketing-roi-analysis": () =>
    import("./examples/marketing-roi-analysis").then(({ marketingRoiAnalysisDemo }) => marketingRoiAnalysisDemo),
  "order-fulfillment-analysis": () =>
    import("./examples/order-fulfillment-analysis").then(
      ({ orderFulfillmentAnalysisDemo }) => orderFulfillmentAnalysisDemo,
    ),
  "research-fund-execution": () =>
    import("./examples/research-fund-execution").then(
      ({ researchFundExecutionDemo }) => researchFundExecutionDemo,
    ),
  "sales-performance-analysis": () =>
    import("./examples/sales-performance-analysis").then(
      ({ salesPerformanceAnalysisDemo }) => salesPerformanceAnalysisDemo,
    ),
  "school-procurement-audit": () =>
    import("./examples/school-procurement-audit").then(
      ({ schoolProcurementAuditDemo }) => schoolProcurementAuditDemo,
    ),
  "shareholder-change-analysis": () =>
    import("./examples/shareholder-change-analysis").then(
      ({ shareholderChangeAnalysisDemo }) => shareholderChangeAnalysisDemo,
    ),
  "student-aid-disbursement": () =>
    import("./examples/student-aid-disbursement").then(
      ({ studentAidDisbursementDemo }) => studentAidDisbursementDemo,
    ),
  "student-fee-reconciliation": () =>
    import("./examples/student-fee-reconciliation").then(
      ({ studentFeeReconciliationDemo }) => studentFeeReconciliationDemo,
    ),
};

export async function loadDemoDefinitionById(id: string): Promise<DemoDefinition | null> {
  return demoLoaders[id]?.() ?? null;
}
