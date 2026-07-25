import type { ChartSpec } from "@openexcel/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getChartRecord: vi.fn(),
  getChartRecordInTransaction: vi.fn(),
  buildChartSpec: vi.fn(),
  createChartInTransaction: vi.fn(),
  deleteChartInTransaction: vi.fn(),
  updateChartInTransaction: vi.fn(),
  buildUpdatedChartSpec: vi.fn(),
  persistUpdatedChart: vi.fn(),
  upsertRunChartSnapshot: vi.fn(),
  upsertRunChartSnapshotUsing: vi.fn(),
  withUndoTrackedMutation: vi.fn(),
  withUndoTrackedSheetMutationAfterSuccess: vi.fn(),
  findChartMutationReceipt: vi.fn(),
  recordChartMutationReceipt: vi.fn(),
}));

vi.mock("./chartService.js", () => ({
  buildChartSpec: mocks.buildChartSpec,
  buildUpdatedChartSpec: mocks.buildUpdatedChartSpec,
  getChartRecord: mocks.getChartRecord,
  getChartRecordInTransaction: mocks.getChartRecordInTransaction,
  persistChart: vi.fn(),
  persistUpdatedChart: mocks.persistUpdatedChart,
  persistDeletedChart: vi.fn(),
}));

vi.mock("../../sessions/runs/repository.js", () => ({
  upsertRunChartSnapshot: mocks.upsertRunChartSnapshot,
  upsertRunChartSnapshotUsing: mocks.upsertRunChartSnapshotUsing,
}));

vi.mock("../../sessions/runs/undoCheckpoint.js", () => ({
  withUndoTrackedMutation: mocks.withUndoTrackedMutation,
  withUndoTrackedSheetMutationAfterSuccess: mocks.withUndoTrackedSheetMutationAfterSuccess,
}));

vi.mock("../infrastructure/chartRepository.js", () => ({
  createChartInTransaction: mocks.createChartInTransaction,
  deleteChartInTransaction: mocks.deleteChartInTransaction,
  updateChartInTransaction: mocks.updateChartInTransaction,
}));
vi.mock("../infrastructure/chartMutationReceiptRepository.js", () => ({
  findChartMutationReceipt: mocks.findChartMutationReceipt,
  recordChartMutationReceipt: mocks.recordChartMutationReceipt,
}));

import {
  createChartMutation,
  deleteChartMutation,
  updateChartMutation,
} from "./chartMutationService.js";

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
    mocks.getChartRecordInTransaction.mockResolvedValue({ spec: previous, order: 4 });
    mocks.buildChartSpec.mockReturnValue(previous);
    mocks.createChartInTransaction.mockResolvedValue({ id: 1 });
    mocks.updateChartInTransaction.mockResolvedValue({ id: 1 });
    mocks.deleteChartInTransaction.mockResolvedValue({ id: 1 });
    mocks.buildUpdatedChartSpec.mockReturnValue(next);
    mocks.persistUpdatedChart.mockResolvedValue(next);
    mocks.findChartMutationReceipt.mockResolvedValue(null);
    mocks.withUndoTrackedMutation.mockImplementation(
      async (
        _workspaceId: number,
        resolveSheetIds: number[] | (() => Promise<number[]>),
        mutation: () => Promise<unknown>,
      ) => {
        if (typeof resolveSheetIds === "function") await resolveSheetIds();
        return mutation();
      },
    );
    mocks.withUndoTrackedSheetMutationAfterSuccess.mockImplementation(
      async (
        _workspaceId: number,
        resolveSheetIds: number[] | (() => Promise<number[]>),
        mutation: (value: unknown) => Promise<unknown>,
      ) => {
        if (typeof resolveSheetIds === "function") await resolveSheetIds();
        return mutation({});
      },
    );
  });

  it("creates the chart and undo snapshot through one transaction for a run", async () => {
    const tx = { chart: {}, agentRunChartSnapshot: {} };
    mocks.withUndoTrackedSheetMutationAfterSuccess.mockImplementation(
      async (
        _workspaceId: number,
        _sheetIds: number[],
        mutation: (value: unknown) => Promise<unknown>,
      ) => mutation(tx),
    );

    await createChartMutation(
      1,
      {
        workbookId: "7",
        sheetId: "11",
        type: "line",
        anchor: previous.anchor,
        series: previous.series,
      },
      { runId: 20 },
    );

    expect(mocks.upsertRunChartSnapshotUsing).toHaveBeenCalledWith(tx, {
      runId: 20,
      chartId: previous.id,
      workbookId: 7,
      sheetId: 11,
      sheetIds: [11, 10],
      order: 0,
      spec: null,
    });
    expect(mocks.createChartInTransaction).toHaveBeenCalledWith(tx, 1, previous);
  });

  it("records and replays a chart mutation without executing it twice", async () => {
    const tx = { chart: {}, agentRunChartSnapshot: {} };
    mocks.withUndoTrackedSheetMutationAfterSuccess.mockImplementation(
      async (
        _workspaceId: number,
        _sheetIds: number[],
        mutation: (value: unknown) => Promise<unknown>,
      ) => mutation(tx),
    );

    await createChartMutation(
      1,
      {
        workbookId: "7",
        sheetId: "11",
        type: "line",
        anchor: previous.anchor,
        series: previous.series,
      },
      {
        runId: 20,
        db: tx as never,
        mutationId: "ai:20:call-1",
        commandHash: "input-1",
      },
    );
    expect(mocks.recordChartMutationReceipt).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        mutationId: "ai:20:call-1",
        commandHash: "input-1",
        mutation: "create",
        chartId: previous.id,
      }),
    );

    mocks.findChartMutationReceipt.mockResolvedValue({ id: 1 });
    mocks.createChartInTransaction.mockClear();
    const replay = await createChartMutation(
      1,
      {
        workbookId: "7",
        sheetId: "11",
        type: "line",
        anchor: previous.anchor,
        series: previous.series,
      },
      {
        runId: 20,
        db: tx as never,
        mutationId: "ai:20:call-1",
        commandHash: "input-1",
      },
    );
    expect(replay).toEqual({ id: 1 });
    expect(mocks.createChartInTransaction).not.toHaveBeenCalled();
  });

  it("rejects a chart mutation id reused with different input", async () => {
    mocks.findChartMutationReceipt.mockRejectedValue(new Error("different input"));
    await expect(
      createChartMutation(
        1,
        {
          workbookId: "7",
          sheetId: "11",
          type: "line",
          anchor: previous.anchor,
          series: previous.series,
        },
        {
          runId: 20,
          db: {} as never,
          mutationId: "ai:20:call-1",
          commandHash: "input-2",
        },
      ),
    ).rejects.toThrow("different input");
  });

  it("uses the union of previous and next chart dependencies for undo invalidation", async () => {
    await updateChartMutation(1, "chart-1", { series: next.series }, { runId: 20 });

    expect(mocks.upsertRunChartSnapshotUsing).toHaveBeenCalledWith(
      {},
      {
        runId: 20,
        chartId: "chart-1",
        workbookId: 7,
        sheetId: 11,
        sheetIds: [11, 10, 12],
        order: 4,
        spec: JSON.stringify(previous),
      },
    );
    expect(mocks.updateChartInTransaction).toHaveBeenCalledWith({}, 1, "chart-1", next);
  });

  it("deletes the chart and undo snapshot through one transaction for a run", async () => {
    const tx = { chart: {}, agentRunChartSnapshot: {} };
    mocks.withUndoTrackedSheetMutationAfterSuccess.mockImplementation(
      async (
        _workspaceId: number,
        _sheetIds: number[],
        mutation: (value: unknown) => Promise<unknown>,
      ) => mutation(tx),
    );

    await deleteChartMutation(1, "chart-1", { runId: 20 });

    expect(mocks.upsertRunChartSnapshotUsing).toHaveBeenCalledWith(tx, {
      runId: 20,
      chartId: "chart-1",
      workbookId: 7,
      sheetId: 11,
      sheetIds: [11, 10],
      order: 4,
      spec: JSON.stringify(previous),
    });
    expect(mocks.deleteChartInTransaction).toHaveBeenCalledWith(tx, 1, "chart-1");
  });

  it("replays update and delete receipts before reading a missing chart", async () => {
    const tx = { chartMutationReceipt: {} };
    mocks.findChartMutationReceipt.mockResolvedValue({ id: 1 });

    await expect(
      updateChartMutation(
        1,
        "missing-chart",
        { series: next.series },
        {
          runId: 20,
          db: tx as never,
          mutationId: "ai:20:update-1",
          commandHash: "input-1",
        },
      ),
    ).resolves.toEqual({ id: 1 });
    await expect(
      deleteChartMutation(1, "missing-chart", {
        runId: 20,
        db: tx as never,
        mutationId: "ai:20:delete-1",
        commandHash: "input-1",
      }),
    ).resolves.toEqual({ id: 1 });
    expect(mocks.getChartRecord).not.toHaveBeenCalled();
  });
});
