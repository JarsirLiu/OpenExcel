import { describe, expect, it } from "vitest";
import {
  studentFeeInitialSheets,
  studentFeePrompt,
  studentFeeSteps,
} from "./studentFeeReconciliation";

describe("studentFeeReconciliation demo", () => {
  it("keeps the demo data separate from the production workbook contract", () => {
    expect(studentFeeInitialSheets.map((sheet) => sheet.name)).toEqual([
      "学生应收台账",
      "银行缴费流水",
      "减免与助学贷款",
      "缴费对账结果",
      "学院收费汇总",
    ]);
    expect(studentFeePrompt).not.toContain("图表");
  });

  it("only scripts tools that are currently supported by this demo", () => {
    expect(studentFeeSteps.map((step) => step.toolName).filter(Boolean)).toEqual([
      "readSheet",
      "readSheet",
      "writeCells",
      "writeCells",
      "writeCells",
    ]);
    expect(studentFeeSteps.at(-1)?.id).toBe("finish");
  });
});
