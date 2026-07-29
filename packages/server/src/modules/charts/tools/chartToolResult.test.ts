import { excelToolSpecs } from "@openexcel/core";
import { describe, expect, it } from "vitest";
import { toCreateChartToolResult } from "./chartToolResult.js";

describe("toCreateChartToolResult", () => {
  it("bounds chart diagnostics while preserving counts and schema validity", () => {
    const result = toCreateChartToolResult(
      { publicId: "chart-1", workbookId: 1, sheetId: 2 },
      {
        categoryCount: 100,
        missingCategoryIndexes: Array.from({ length: 100 }, (_, index) => index),
        series: Array.from({ length: 25 }, (_, seriesIndex) => ({
          seriesId: `series-${seriesIndex}`,
          name: `Series ${seriesIndex}`,
          pointCount: 100,
          missingValueIndexes: Array.from({ length: 100 }, (_, index) => index),
          nonNumericValueIndexes: [],
          formulaCells: Array.from({ length: 100 }, (_, index) => `A${index + 1}`),
          unresolvedFormulaCells: [],
        })),
      },
    );

    expect(result.dataQuality).toMatchObject({
      categoryCount: 100,
      missingCategoryIndexes: Array.from({ length: 20 }, (_, index) => index),
      missingCategoryIndexesTruncated: true,
      seriesCount: 25,
      seriesTruncated: true,
    });
    expect(result.dataQuality?.series).toHaveLength(20);
    expect(result.dataQuality?.series[0]).toMatchObject({
      missingValueIndexes: Array.from({ length: 20 }, (_, index) => index),
      formulaCells: Array.from({ length: 20 }, (_, index) => `A${index + 1}`),
      indexesTruncated: true,
    });
    expect(excelToolSpecs.createChart.outputSchema.safeParse(result).success).toBe(true);
  });
});
