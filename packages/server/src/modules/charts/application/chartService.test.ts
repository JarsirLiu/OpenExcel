import type { ChartSpec } from "@openexcel/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as repository from "../infrastructure/chartRepository.js";
import { buildChartSpec, buildUpdatedChartSpec, listCharts } from "./chartService.js";

vi.mock("../infrastructure/chartRepository.js", () => ({
  createChart: vi.fn(),
  deleteChart: vi.fn(),
  findChart: vi.fn(),
  findChartsForWorkbook: vi.fn(),
  updateChart: vi.fn(),
}));

const baseChart: ChartSpec = {
  id: "chart_test",
  workbookId: "7",
  sheetId: "11",
  type: "line",
  title: "收入",
  anchor: {
    kind: "oneCell",
    from: { row: 0, col: 4 },
    widthEmu: 4_000_000,
    heightEmu: 2_500_000,
  },
  series: [
    {
      id: "series_test",
      name: "金额",
      categoryRef: { sheetId: "11", start: { row: 0, col: 0 }, end: { row: 3, col: 0 } },
      valueRef: { sheetId: "11", start: { row: 0, col: 1 }, end: { row: 3, col: 1 } },
    },
  ],
};

function storedChart(spec: ChartSpec) {
  return {
    id: 1,
    publicId: spec.id,
    workbookId: Number(spec.workbookId),
    sheetId: Number(spec.sheetId),
    order: 0,
    spec: JSON.stringify(spec),
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

describe("chartService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds a validated chart spec and assigns an id when needed", () => {
    const result = buildChartSpec({ ...baseChart, id: undefined });

    expect(result).toMatchObject({ workbookId: "7", sheetId: "11" });
    expect(result.id).toMatch(/^chart_/);
  });

  it("builds a partial update without changing chart identity", () => {
    const result = buildUpdatedChartSpec(baseChart, { title: null });

    expect(result.id).toBe(baseChart.id);
    expect(result.workbookId).toBe(baseChart.workbookId);
    expect(result.title).toBeUndefined();
  });

  it("returns only charts from the requested workbook", async () => {
    vi.mocked(repository.findChartsForWorkbook).mockResolvedValue([
      storedChart(baseChart),
    ] as never);

    await expect(listCharts(1, 7)).resolves.toEqual([baseChart]);
    expect(repository.findChartsForWorkbook).toHaveBeenCalledWith(1, 7);
  });
});
