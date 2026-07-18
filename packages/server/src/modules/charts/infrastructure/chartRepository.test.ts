import type { ChartSpec } from "@openexcel/core";
import { describe, expect, it, vi } from "vitest";
import { createChartsInTransaction, createImportedChartsInTransaction } from "./chartRepository.js";

vi.mock("../../../infra/database/db.js", () => ({ prisma: {} }));

const chart: ChartSpec = {
  id: "chart-1",
  workbookId: "7",
  sheetId: "11",
  type: "line",
  title: "销售趋势",
  anchor: {
    kind: "oneCell",
    from: { row: 1, col: 3 },
    widthEmu: 1_000,
    heightEmu: 2_000,
  },
  series: [
    {
      id: "series-1",
      name: "销售额",
      categoryRef: {
        sheetId: "11",
        start: { row: 0, col: 0 },
        end: { row: 2, col: 0 },
      },
      valueRef: {
        sheetId: "11",
        start: { row: 0, col: 1 },
        end: { row: 2, col: 1 },
      },
    },
  ],
};

describe("createChartsInTransaction", () => {
  it("persists already-materialized ChartSpec values", async () => {
    const chartCreate = vi.fn().mockResolvedValue({});
    const sheetFindMany = vi.fn().mockResolvedValue([{ id: 11 }]);
    const tx = {
      workbook: { findFirst: vi.fn().mockResolvedValue({ id: 7 }) },
      chart: {
        aggregate: vi.fn().mockResolvedValue({ _max: { order: 2 } }),
        create: chartCreate,
      },
      sheet: {
        findMany: sheetFindMany,
      },
    } as never;

    await createChartsInTransaction(tx, 3, 7, [chart]);

    expect(chartCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workbookId: 7,
          sheetId: 11,
          order: 3,
          spec: expect.stringContaining('"sheetId":"11"'),
        }),
      }),
    );
    expect(sheetFindMany).toHaveBeenCalledTimes(1);
  });

  it("rejects a ChartSpec from a different workbook", async () => {
    const chartCreate = vi.fn();
    const tx = {
      workbook: { findFirst: vi.fn().mockResolvedValue({ id: 7 }) },
      chart: {
        aggregate: vi.fn().mockResolvedValue({ _max: { order: null } }),
        create: chartCreate,
      },
      sheet: { findMany: vi.fn().mockResolvedValue([{ id: 11 }]) },
    } as never;

    await expect(
      createChartsInTransaction(tx, 3, 7, [{ ...chart, workbookId: "8" }]),
    ).rejects.toThrow("different workbook");
    expect(chartCreate).not.toHaveBeenCalled();
  });

  it("materializes imported chart references before persistence", async () => {
    const chartCreate = vi.fn().mockResolvedValue({});
    const tx = {
      workbook: { findFirst: vi.fn().mockResolvedValue({ id: 7 }) },
      chart: {
        aggregate: vi.fn().mockResolvedValue({ _max: { order: null } }),
        create: chartCreate,
      },
      sheet: { findMany: vi.fn().mockResolvedValue([{ id: 11 }]) },
    } as never;

    await createImportedChartsInTransaction(
      tx,
      3,
      7,
      [
        {
          id: "source-chart",
          sheetKey: "sheet-0",
          type: "line",
          anchor: { kind: "oneCell", from: { row: 1, col: 3 }, widthEmu: 1_000, heightEmu: 2_000 },
          series: [
            {
              id: "series-1",
              categoryRef: {
                sheetKey: "sheet-0",
                start: { row: 0, col: 0 },
                end: { row: 2, col: 0 },
              },
              valueRef: {
                sheetKey: "sheet-0",
                start: { row: 0, col: 1 },
                end: { row: 2, col: 1 },
              },
            },
          ],
        },
      ],
      new Map([["sheet-0", "11"]]),
    );

    expect(chartCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workbookId: 7,
          sheetId: 11,
          spec: expect.stringContaining('"workbookId":"7"'),
        }),
      }),
    );
  });
});
