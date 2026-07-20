import { describe, expect, it } from "vitest";
import { validateDemoDefinition } from "../../runtime/validateDemoDefinition";
import { bankTransactionAuditDemo } from "./definition";
import { bankAuditInitialWorkbooks, bankAuditTimeline, bankAuditTransactions } from "./fixtures";

describe("bankTransactionAudit demo", () => {
  it("provides the source, rules, exception, and summary sheets", () => {
    expect(bankAuditInitialWorkbooks).toHaveLength(1);
    expect(bankAuditInitialWorkbooks[0].sheets.map((sheet) => sheet.name)).toEqual([
      "银行流水",
      "核查规则",
      "异常明细",
      "核查汇总",
    ]);
    expect(bankAuditTransactions).toHaveLength(16);
    expect(bankAuditTransactions.filter((item) => item.audit.status === "异常")).toHaveLength(11);
  });

  it("keeps audit result cells empty before replay", () => {
    const transactionSheet = bankAuditInitialWorkbooks[0].sheets[0];
    expect(
      transactionSheet.rows
        .slice(1)
        .every((row) => row.slice(7).every((cell) => cell.value === "")),
    ).toBe(true);
  });

  it("replays inspection and checks before writing auditable results", () => {
    expect(bankAuditTimeline.map((step) => step.toolName).filter(Boolean)).toEqual([
      "readSheetData",
      "readSheetData",
      "findSheetCells",
      "readSheetData",
      "readSheetData",
      "writeCells",
      "writeCells",
      "writeCells",
      "readSheetData",
    ]);
    expect(bankAuditTimeline.at(-1)?.id).toBe("finish");
    expect(validateDemoDefinition(bankTransactionAuditDemo)).toEqual([]);
  });
});
