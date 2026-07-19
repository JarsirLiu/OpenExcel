import { describe, expect, it } from "vitest";
import {
  studentFeeInitialSheets,
  studentFeePrompt,
  studentFeeSteps,
} from "./studentFeeReconciliation";

describe("studentFeeReconciliation demo", () => {
  it("keeps the demo data separate from the production workbook contract", () => {
    expect(studentFeeInitialSheets.map((sheet) => sheet.name)).toEqual([
      "学生收费台账",
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

  it("starts with empty calculated columns and scripts formulas as writes", () => {
    const ledger = studentFeeInitialSheets[0];
    expect(ledger.rows[1][8]).toEqual({ value: "" });
    expect(ledger.rows[1][9]).toEqual({ value: "" });
    expect(ledger.rows[1][10]).toEqual({ value: "" });

    const formulaStep = studentFeeSteps.find((step) => step.id === "write-formulas");
    expect(Array.isArray(formulaStep?.patch)).toBe(true);
    expect(formulaStep?.patch).toHaveLength(12);
    expect((formulaStep?.patch as any[])[0].values[0].formula).toBe("=D2+E2-F2");
    expect((formulaStep?.patch as any[])[0].values[1].formula).toBe("=MAX(I2-H2,0)");
  });
});
