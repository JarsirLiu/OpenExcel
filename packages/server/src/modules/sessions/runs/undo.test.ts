import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUndoCheckpointRun: vi.fn(),
  transaction: vi.fn(),
  sessionFindFirst: vi.fn(),
  agentRunSheetSnapshotFindMany: vi.fn(),
  agentRunSheetSnapshotDeleteMany: vi.fn(),
  agentRunChartSnapshotFindMany: vi.fn(),
  agentRunChartSnapshotDeleteMany: vi.fn(),
  sheetFindFirst: vi.fn(),
  sheetUpdate: vi.fn(),
  sheetDelete: vi.fn(),
  sheetFindMany: vi.fn(),
  workbookFindFirst: vi.fn(),
  workbookDelete: vi.fn(),
  sessionUpdate: vi.fn(),
  sessionUpdateMany: vi.fn(),
  agentRunUpdate: vi.fn(),
  chartDeleteMany: vi.fn(),
  chartUpsert: vi.fn(),
  executeSheetCommandInTransaction: vi.fn(),
}));

vi.mock("./repository.js", () => ({
  findUndoCheckpointRun: mocks.findUndoCheckpointRun,
}));

vi.mock("../infrastructure/workspaceUndoLock.js", () => ({
  withWorkspaceUndoLock: (_workspaceId: number, operation: () => Promise<unknown>) => operation(),
}));

vi.mock("../../sheets/application/executeSheetCommand.js", () => ({
  executeSheetCommandInTransaction: mocks.executeSheetCommandInTransaction,
}));

vi.mock("../../../infra/database/db.js", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

import { undoLatestRun } from "./undo.js";

function buildTx() {
  return {
    session: {
      findFirst: mocks.sessionFindFirst,
      update: mocks.sessionUpdate,
      updateMany: mocks.sessionUpdateMany,
    },
    agentRunSheetSnapshot: {
      findMany: mocks.agentRunSheetSnapshotFindMany,
      deleteMany: mocks.agentRunSheetSnapshotDeleteMany,
    },
    agentRunChartSnapshot: {
      findMany: mocks.agentRunChartSnapshotFindMany,
      deleteMany: mocks.agentRunChartSnapshotDeleteMany,
    },
    sheet: {
      findFirst: mocks.sheetFindFirst,
      update: mocks.sheetUpdate,
      delete: mocks.sheetDelete,
      findMany: mocks.sheetFindMany,
    },
    workbook: {
      findFirst: mocks.workbookFindFirst,
      delete: mocks.workbookDelete,
    },
    agentRun: {
      update: mocks.agentRunUpdate,
    },
    chart: {
      deleteMany: mocks.chartDeleteMany,
      upsert: mocks.chartUpsert,
    },
  } as any;
}

describe("undoLatestRun", () => {
  beforeEach(() => {
    mocks.findUndoCheckpointRun.mockReset();
    mocks.transaction.mockReset();
    mocks.sessionFindFirst.mockReset();
    mocks.agentRunSheetSnapshotFindMany.mockReset();
    mocks.agentRunSheetSnapshotDeleteMany.mockReset();
    mocks.agentRunChartSnapshotFindMany.mockReset();
    mocks.agentRunChartSnapshotDeleteMany.mockReset();
    mocks.sheetFindFirst.mockReset();
    mocks.sheetUpdate.mockReset();
    mocks.sheetDelete.mockReset();
    mocks.sheetFindMany.mockReset();
    mocks.workbookFindFirst.mockReset();
    mocks.workbookDelete.mockReset();
    mocks.sessionUpdate.mockReset();
    mocks.sessionUpdateMany.mockReset();
    mocks.agentRunUpdate.mockReset();
    mocks.chartDeleteMany.mockReset();
    mocks.chartUpsert.mockReset();
    mocks.executeSheetCommandInTransaction.mockReset();
  });

  it("should undo a created workbook and restore the prompt", async () => {
    mocks.findUndoCheckpointRun.mockResolvedValueOnce({
      id: 11,
      inputText: "创建一个工作簿",
      steps: [
        {
          order: 0,
          toolName: "createWorkbook",
          output: JSON.stringify([
            {
              toolName: "createWorkbook",
              output: { id: 21, initialSheet: { id: 31 } },
            },
          ]),
        },
      ],
      snapshots: [],
    });
    mocks.transaction.mockImplementationOnce(async (callback: (tx: any) => Promise<any>) =>
      callback(buildTx()),
    );
    mocks.sessionFindFirst.mockResolvedValueOnce({
      id: 5,
      undoRunId: 11,
      chatMessages: JSON.stringify([
        { role: "user", content: "创建一个工作簿" },
        { role: "assistant", content: "好的" },
      ]),
    });
    mocks.agentRunSheetSnapshotFindMany.mockResolvedValueOnce([]);
    mocks.sessionUpdate.mockResolvedValueOnce({ id: 5 });
    mocks.agentRunUpdate.mockResolvedValueOnce({ id: 11 });
    mocks.workbookDelete.mockResolvedValueOnce({ id: 21 });

    const result = await undoLatestRun(8, 5);

    expect(result).toEqual({
      runId: 11,
      restoredSheetIds: [],
      undoneUserText: "创建一个工作簿",
    });
    expect(mocks.workbookDelete).toHaveBeenCalledWith({ where: { id: 21 } });
    expect(mocks.sessionUpdate).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { chatMessages: "[]", undoRunId: null },
    });
    expect(mocks.agentRunUpdate).toHaveBeenCalledWith({
      where: { id: 11 },
      data: {
        status: "reverted",
        revertedAt: expect.any(Date),
      },
    });
  });

  it("should undo a created sheet without restoring the created sheet snapshot", async () => {
    mocks.findUndoCheckpointRun.mockResolvedValueOnce({
      id: 12,
      inputText: "新建一个 sheet",
      steps: [
        {
          order: 0,
          toolName: "createSheet",
          output: JSON.stringify([
            {
              toolName: "createSheet",
              output: { workbookId: 9, id: 77 },
            },
          ]),
        },
      ],
      snapshots: [],
    });
    mocks.transaction.mockImplementationOnce(async (callback: (tx: any) => Promise<any>) =>
      callback(buildTx()),
    );
    mocks.sessionFindFirst.mockResolvedValueOnce({
      id: 6,
      undoRunId: 12,
      chatMessages: JSON.stringify([
        { role: "user", content: "新建一个 sheet" },
        { role: "assistant", content: "已创建" },
      ]),
    });
    const mergedUploadedData = JSON.stringify([
      { r: 0, c: 0, v: { v: "A", m: "A", mc: { r: 0, c: 0, rs: 1, cs: 2 } } },
      { r: 0, c: 1, v: { mc: { r: 0, c: 0, rs: 1, cs: 2 } } },
    ]);
    mocks.agentRunSheetSnapshotFindMany.mockResolvedValueOnce([
      {
        sheetId: 15,
        uploadedData: mergedUploadedData,
        config: null,
        kind: "restorable",
        beforeRevision: 0,
        afterRevision: 1,
      },
      { sheetId: 77, uploadedData: "[2]", config: null, kind: "created" },
    ]);
    mocks.sheetFindFirst
      .mockResolvedValueOnce({ id: 15, revision: 1 })
      .mockResolvedValueOnce({ id: 77 });
    mocks.workbookFindFirst.mockResolvedValueOnce({ id: 9 });
    mocks.sheetFindMany.mockResolvedValueOnce([
      { id: 15, order: 0 },
      { id: 18, order: 1 },
    ]);
    mocks.executeSheetCommandInTransaction.mockResolvedValue({ revision: 2 });
    mocks.sheetUpdate.mockResolvedValue({ id: 15 });
    mocks.sheetDelete.mockResolvedValueOnce({ id: 77 });
    mocks.agentRunSheetSnapshotDeleteMany.mockResolvedValueOnce({ count: 2 });
    mocks.sessionUpdate.mockResolvedValueOnce({ id: 6 });
    mocks.agentRunUpdate.mockResolvedValueOnce({ id: 12 });

    const result = await undoLatestRun(8, 6);

    expect(result).toEqual({
      runId: 12,
      restoredSheetIds: [15],
      undoneUserText: "新建一个 sheet",
    });
    expect(mocks.executeSheetCommandInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      8,
      expect.objectContaining({
        kind: "replaceSnapshot",
        mutationId: "undo:12:15",
        sheetId: 15,
        baseRevision: 1,
      }),
    );
    expect(mocks.sheetDelete).toHaveBeenCalledWith({ where: { id: 77 } });
    expect(mocks.sessionUpdate).toHaveBeenCalledWith({
      where: { id: 6 },
      data: { chatMessages: "[]", undoRunId: null },
    });
  });

  it("should remove a chart created by the latest run", async () => {
    mocks.findUndoCheckpointRun.mockResolvedValueOnce({
      id: 13,
      inputText: "创建图表",
      steps: [],
      snapshots: [],
      chartSnapshots: [{ chartId: "chart_1", spec: null }],
    });
    mocks.transaction.mockImplementationOnce(async (callback: (tx: any) => Promise<any>) =>
      callback(buildTx()),
    );
    mocks.sessionFindFirst.mockResolvedValueOnce({
      id: 7,
      undoRunId: 13,
      chatMessages: JSON.stringify([
        { role: "user", content: "创建图表" },
        { role: "assistant", content: "已创建" },
      ]),
    });
    mocks.agentRunSheetSnapshotFindMany.mockResolvedValueOnce([]);
    mocks.agentRunChartSnapshotFindMany.mockResolvedValueOnce([
      { chartId: "chart_1", spec: null, sheetId: 11 },
    ]);
    mocks.chartDeleteMany.mockResolvedValueOnce({ count: 1 });
    mocks.agentRunChartSnapshotDeleteMany.mockResolvedValueOnce({ count: 1 });
    mocks.sessionUpdate.mockResolvedValueOnce({ id: 7 });
    mocks.agentRunUpdate.mockResolvedValueOnce({ id: 13 });

    await undoLatestRun(8, 7);

    expect(mocks.chartDeleteMany).toHaveBeenCalledWith({ where: { publicId: "chart_1" } });
    expect(mocks.agentRunChartSnapshotDeleteMany).toHaveBeenCalledWith({ where: { runId: 13 } });
  });

  it("should invalidate a checkpoint when its sheet revision has advanced", async () => {
    mocks.findUndoCheckpointRun.mockResolvedValueOnce({
      id: 14,
      inputText: "写入单元格",
      steps: [],
      snapshots: [],
    });
    mocks.transaction.mockImplementationOnce(async (callback: (tx: any) => Promise<any>) =>
      callback(buildTx()),
    );
    mocks.sessionFindFirst.mockResolvedValueOnce({
      id: 8,
      undoRunId: 14,
      chatMessages: JSON.stringify([{ role: "user", content: "写入单元格" }]),
    });
    mocks.agentRunSheetSnapshotFindMany.mockResolvedValueOnce([
      {
        runId: 14,
        sheetId: 15,
        uploadedData: "[]",
        config: null,
        kind: "restorable",
        beforeRevision: 0,
        afterRevision: 1,
      },
    ]);
    mocks.sheetFindFirst.mockResolvedValueOnce({ id: 15, revision: 2 });

    await expect(undoLatestRun(8, 8)).rejects.toThrow("已被其他操作修改");

    expect(mocks.sessionUpdateMany).toHaveBeenCalledWith({
      where: { id: 8, undoRunId: 14 },
      data: { undoRunId: null },
    });
    expect(mocks.agentRunUpdate).toHaveBeenCalledWith({
      where: { id: 14 },
      data: { undoInvalidated: true },
    });
  });
});
