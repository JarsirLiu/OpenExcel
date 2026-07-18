import type { ChartSpec } from "@openexcel/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getChartRecord: vi.fn(),
  buildUpdatedChartSpec: vi.fn(),
  persistUpdatedChart: vi.fn(),
  upsertRunChartSnapshot: vi.fn(),
  withUndoTrackedMutation: vi.fn(),
}));

vi.mock("./chartService.js", () => ({
  buildChartSpec: vi.fn(),
  buildUpdatedChartSpec: mocks.buildUpdatedChartSpec,
  getChartRecord: mocks.getChartRecord,
  persistChart: vi.fn(),
  persistDeletedChart: vi.fn(),
  persistUpdatedChart: mocks.persistUpdatedChart,
}));

vi.mock("../../sessions/runs/repository.js", () => ({
  upsertRunChartSnapshot: mocks.upsertRunChartSnapshot,
}));

vi.mock("../../sessions/runs/undoCheckpoint.js", () => ({
  withUndoTrackedMutation: mocks.withUndoTrackedMutation,
}));

import { updateChartMutation } from "./chartMutationService.js";

const previous: ChartSpec = {
  id: "chart-1",
  workbookId: "7",
  sheetId: "11",
  type: "line",
  anchor: {
    kind: "oneCell",
    from: { row: 0, col: 0 },
    widthEmu: 100,
    heightEmu: 100,
  },
  series: [
    {
      id: "series-1",
      categoryRef: {
        sheetId: "11",
        start: { row: 0, col: 0 },
        end: { row: 2, col: 0 },
      },
      valueRef: {
        sheetId: "10",
        start: { row: 0, col: 1 },
        end: { row: 2, col: 1 },
      },
    },
  ],
};

const next: ChartSpec = {
  ...previous,
  series: [
    {
      ...previous.series[0],
      valueRef: {
        sheetId: "12",
        start: { row: 0, col: 1 },
        end: { row: 2, col: 1 },
      },
    },
  ],
};

describe("chartMutationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getChartRecord.mockResolvedValue({ spec: previous, order: 4 });
    mocks.buildUpdatedChartSpec.mockReturnValue(next);
    mocks.persistUpdatedChart.mockResolvedValue(next);
    mocks.withUndoTrackedMutation.mockImplementation(
      async (
        _workspaceId: number,
        resolveSheetIds: () => Promise<number[]>,
        mutation: () => Promise<unknown>,
      ) => {
        await resolveSheetIds();
        return mutation();
      },
    );
  });

  it("uses the union of previous and next chart dependencies for undo invalidation", async () => {
    await updateChartMutation(1, "chart-1", { series: next.series }, { runId: 20 });

    expect(mocks.upsertRunChartSnapshot).toHaveBeenCalledWith({
      runId: 20,
      chartId: "chart-1",
      workbookId: 7,
      sheetId: 11,
      sheetIds: [11, 10, 12],
      order: 4,
      spec: JSON.stringify(previous),
    });
  });
});
