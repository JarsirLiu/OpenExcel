import { describe, expect, it } from "vitest";
import { validateDemoDefinition } from "../../runtime/validateDemoDefinition";
import { researchFundExecutionDemo } from "./definition";

describe("research fund execution demo", () => {
  it("generates a realistic, repeatable research finance workbook", () => {
    const sheets = researchFundExecutionDemo.initialWorkbooks[0].sheets;
    expect(sheets.map((sheet) => sheet.name)).toEqual([
      "项目预算",
      "支出明细",
      "预算调整",
      "经费执行分析",
    ]);
    expect(sheets[0].rows).toHaveLength(37);
    expect(sheets[1].rows).toHaveLength(217);
    expect(sheets[2].rows).toHaveLength(13);

    const writeStep = researchFundExecutionDemo.timeline.find(
      (step) => step.id === "write-results",
    );
    expect(writeStep?.patch).toHaveLength(36);
    expect(validateDemoDefinition(researchFundExecutionDemo)).toEqual([]);
  });
});
