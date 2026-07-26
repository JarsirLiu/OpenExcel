import { describe, expect, it } from "vitest";
import { toCreateChartToolResult, toUpdateChartToolResult } from "./chartToolResult.js";

describe("chart tool results", () => {
  it("maps a persistence chart record to a model DTO", () => {
    expect(
      toCreateChartToolResult({
        id: 12,
        publicId: "chart-12",
        workbookId: 14,
        sheetId: 32,
        order: 0,
        spec: "{}",
        createdAt: new Date("2026-07-26T08:00:00.000Z"),
        updatedAt: new Date("2026-07-26T08:00:00.000Z"),
      }),
    ).toEqual({
      success: true,
      chartId: "chart-12",
      workbookId: 14,
      sheetId: 32,
    });
  });

  it("keeps update results independent from persistence fields", () => {
    expect(toUpdateChartToolResult({ id: 12, publicId: "chart-12" }, "chart-12")).toEqual({
      success: true,
      chartId: "chart-12",
    });
  });
});
