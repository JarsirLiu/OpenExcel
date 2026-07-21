import { describe, expect, it } from "vitest";
import { validateDemoDefinition } from "../../runtime/validateDemoDefinition";
import { studentAidDisbursementDemo } from "./definition";

describe("student aid disbursement demo", () => {
  it("generates student, approval and bank records deterministically", () => {
    const sheets = studentAidDisbursementDemo.initialWorkbooks[0].sheets;
    expect(sheets.map((sheet) => sheet.name)).toEqual([
      "学生学籍",
      "资助审批",
      "银行发放",
      "资助发放核查",
    ]);
    expect(sheets[0].rows).toHaveLength(121);
    expect(sheets[1].rows).toHaveLength(121);
    expect(sheets[2].rows).toHaveLength(121);

    const writeStep = studentAidDisbursementDemo.timeline.find(
      (step) => step.id === "write-results",
    );
    expect(writeStep?.patch).toHaveLength(120);
    expect(validateDemoDefinition(studentAidDisbursementDemo)).toEqual([]);
  });
});
