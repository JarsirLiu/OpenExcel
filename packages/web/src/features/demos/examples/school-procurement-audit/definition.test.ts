import { describe, expect, it } from "vitest";
import { validateDemoDefinition } from "../../runtime/validateDemoDefinition";
import { schoolProcurementAuditDemo } from "./definition";

describe("school procurement audit demo", () => {
  it("generates contract, payment and acceptance records deterministically", () => {
    const sheets = schoolProcurementAuditDemo.initialWorkbooks[0].sheets;
    expect(sheets.map((sheet) => sheet.name)).toEqual([
      "采购合同",
      "付款记录",
      "验收记录",
      "采购付款风险",
    ]);
    expect(sheets[0].rows).toHaveLength(49);
    expect(sheets[1].rows).toHaveLength(145);
    expect(sheets[2].rows).toHaveLength(97);

    const writeStep = schoolProcurementAuditDemo.timeline.find(
      (step) => step.id === "write-results",
    );
    expect(writeStep?.patch).toHaveLength(48);
    expect(validateDemoDefinition(schoolProcurementAuditDemo)).toEqual([]);
  });
});
