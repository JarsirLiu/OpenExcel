import { describe, expect, it } from "vitest";
import { validateDemoDefinition } from "../../runtime/validateDemoDefinition";
import { departmentBudgetMonitoringDemo } from "./definition";

describe("department budget monitoring demo", () => {
  it("generates department budgets, expenses and commitments deterministically", () => {
    const sheets = departmentBudgetMonitoringDemo.initialWorkbooks[0].sheets;
    expect(sheets.map((sheet) => sheet.name)).toEqual([
      "部门预算",
      "月度支出",
      "预算调整",
      "待支付事项",
      "部门预算预警",
    ]);
    expect(sheets[0].rows).toHaveLength(37);
    expect(sheets[1].rows).toHaveLength(217);
    expect(sheets[2].rows).toHaveLength(36);
    expect(sheets[3].rows).toHaveLength(73);

    const writeStep = departmentBudgetMonitoringDemo.timeline.find(
      (step) => step.id === "write-results",
    );
    expect(writeStep?.patch).toHaveLength(36);
    expect(validateDemoDefinition(departmentBudgetMonitoringDemo)).toEqual([]);
  });
});
