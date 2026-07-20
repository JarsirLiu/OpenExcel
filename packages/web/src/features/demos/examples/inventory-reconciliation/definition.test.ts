import { describe, expect, it } from "vitest";
import {
  inventoryInitialWorkbooks,
  inventoryReconciliationPrompt,
  inventoryTimeline,
} from "./fixtures";

describe("inventoryReconciliation demo", () => {
  it("uses the three source and target sheets from the supermarket example", () => {
    expect(inventoryInitialWorkbooks.map((workbook) => workbook.name)).toEqual([
      "1.系统单价表",
      "2.单品进销存20260516202238",
      "3.超市产品进货、出货统计表-5.18",
    ]);
    expect(inventoryInitialWorkbooks.every((workbook) => workbook.sheets.length === 1)).toBe(true);
    expect(inventoryInitialWorkbooks[0].sheets[0].rows.every((row) => row.length === 18)).toBe(
      true,
    );
    expect(inventoryInitialWorkbooks[1].sheets[0].rows.every((row) => row.length === 45)).toBe(
      true,
    );
    expect(inventoryInitialWorkbooks[2].sheets[0].rows.every((row) => row.length === 19)).toBe(
      true,
    );
    expect(inventoryReconciliationPrompt).toContain("B列产品名称");
  });

  it("leaves matching columns blank while retaining calculation formulas", () => {
    const report = inventoryInitialWorkbooks[2].sheets[0];
    expect(report.rows[2][3].value).toBe("");
    expect(report.rows[2][4].value).toBe("");
    expect(report.rows[2][5]).toMatchObject({ value: "", formula: "=D3*E3" });
    expect(report.rows[2][6].value).toBe("");
    expect(report.rows[2][16]).toMatchObject({
      value: "",
      formula: "=E3-H3-J3+L3-O3",
    });
  });

  it("replays reads before writes and finishes with a verification read", () => {
    expect(inventoryTimeline.map((step) => step.toolName).filter(Boolean)).toEqual([
      "readSheetData",
      "readSheetData",
      "readSheetData",
      "writeCells",
      "writeCells",
      "readSheetData",
    ]);
    expect(inventoryTimeline.at(-1)?.id).toBe("finish");
    expect(inventoryTimeline.find((step) => step.id === "write-prices")?.patch).toHaveLength(10);
  });
});
