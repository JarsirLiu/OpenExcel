import { describe, expect, it } from "vitest";
import type { DemoSheet } from "../runtime/replayTypes";
import {
  demoCell,
  demoPresentationRowCount,
  expandDemoSheetForPresentation,
} from "./scenarioFactory";

describe("scenarioFactory", () => {
  describe("expandDemoSheetForPresentation", () => {
    it("fills a short source sheet with deterministic presentation samples", () => {
      const sheet: DemoSheet = {
        name: "订单明细",
        columns: ["订单号", "金额"],
        rows: [
          [demoCell("订单号"), demoCell("金额")],
          [demoCell("SO001"), demoCell(1000, { numberFormat: "#,##0.00" })],
          [demoCell("SO002"), demoCell(1200, { numberFormat: "#,##0.00" })],
        ],
      };

      const expanded = expandDemoSheetForPresentation(sheet);

      expect(expanded.rows).toHaveLength(demoPresentationRowCount);
      expect(expanded.rows.slice(0, 3)).toEqual(sheet.rows);
      expect(expanded.rows[3]?.[0]?.value).toBe("SO003");
      expect(expanded.rows[3]?.[1]?.value).not.toBe(1000);
    });

    it("does not pad an intentionally blank result sheet", () => {
      const sheet: DemoSheet = {
        name: "分析结果",
        columns: ["对象", "结论"],
        rows: [
          [demoCell("对象"), demoCell("结论")],
          [demoCell(""), demoCell("")],
        ],
      };

      expect(expandDemoSheetForPresentation(sheet)).toBe(sheet);
    });
  });
});
