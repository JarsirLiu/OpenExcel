import { encodeDocumentJson } from "@openexcel/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findLatestUndoableRun: vi.fn(),
  transaction: vi.fn(),
  sessionFindFirst: vi.fn(),
  agentRunSheetSnapshotFindMany: vi.fn(),
  agentRunSheetSnapshotDeleteMany: vi.fn(),
  sheetUpdate: vi.fn(),
  sheetChunkDeleteMany: vi.fn(),
  sheetChunkCreate: vi.fn(),
  sheetObjectDeleteMany: vi.fn(),
  sheetObjectCreate: vi.fn(),
  sheetDelete: vi.fn(),
  sheetFindMany: vi.fn(),
  workbookFindFirst: vi.fn(),
  workbookDelete: vi.fn(),
  sessionUpdate: vi.fn(),
  agentRunUpdate: vi.fn(),
}));

vi.mock("./repository.js", () => ({
  findLatestUndoableRun: mocks.findLatestUndoableRun,
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
    },
    agentRunSheetSnapshot: {
      findMany: mocks.agentRunSheetSnapshotFindMany,
      deleteMany: mocks.agentRunSheetSnapshotDeleteMany,
    },
    sheet: {
      update: mocks.sheetUpdate,
      delete: mocks.sheetDelete,
      findMany: mocks.sheetFindMany,
    },
    sheetChunk: {
      deleteMany: mocks.sheetChunkDeleteMany,
      create: mocks.sheetChunkCreate,
    },
    sheetObject: {
      deleteMany: mocks.sheetObjectDeleteMany,
      create: mocks.sheetObjectCreate,
    },
    workbook: {
      findFirst: mocks.workbookFindFirst,
      delete: mocks.workbookDelete,
    },
    agentRun: {
      update: mocks.agentRunUpdate,
    },
  } as any;
}

describe("undoLatestRun", () => {
  beforeEach(() => {
    mocks.findLatestUndoableRun.mockReset();
    mocks.transaction.mockReset();
    mocks.sessionFindFirst.mockReset();
    mocks.agentRunSheetSnapshotFindMany.mockReset();
    mocks.agentRunSheetSnapshotDeleteMany.mockReset();
    mocks.sheetUpdate.mockReset();
    mocks.sheetChunkDeleteMany.mockReset();
    mocks.sheetChunkCreate.mockReset();
    mocks.sheetObjectDeleteMany.mockReset();
    mocks.sheetObjectCreate.mockReset();
    mocks.sheetDelete.mockReset();
    mocks.sheetFindMany.mockReset();
    mocks.workbookFindFirst.mockReset();
    mocks.workbookDelete.mockReset();
    mocks.sessionUpdate.mockReset();
    mocks.agentRunUpdate.mockReset();
  });

  it("should undo a created workbook and restore the prompt", async () => {
    mocks.findLatestUndoableRun.mockResolvedValueOnce({
      id: 11,
      inputText: "创建一个工作簿",
      steps: [
        {
          order: 0,
          toolName: "createWorkbook",
          output: JSON.stringify({
            id: 21,
            initialSheet: { id: 31 },
          }),
        },
      ],
      snapshots: [],
    });
    mocks.transaction.mockImplementationOnce(async (callback: (tx: any) => Promise<any>) =>
      callback(buildTx()),
    );
    mocks.sessionFindFirst.mockResolvedValueOnce({
      id: 5,
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
      data: { chatMessages: "[]" },
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
    mocks.findLatestUndoableRun.mockResolvedValueOnce({
      id: 12,
      inputText: "新建一个 sheet",
      steps: [
        {
          order: 0,
          toolName: "createSheet",
          output: JSON.stringify({
            workbookId: 9,
            id: 77,
          }),
        },
      ],
      snapshots: [],
    });
    mocks.transaction.mockImplementationOnce(async (callback: (tx: any) => Promise<any>) =>
      callback(buildTx()),
    );
    mocks.sessionFindFirst.mockResolvedValueOnce({
      id: 6,
      chatMessages: JSON.stringify([
        { role: "user", content: "新建一个 sheet" },
        { role: "assistant", content: "已创建" },
      ]),
    });
    mocks.agentRunSheetSnapshotFindMany.mockResolvedValueOnce([
      {
        sheetId: 15,
        documentRevision: 3,
        documentMaxRow: 10,
        documentMaxColumn: 4,
        documentChunks: encodeDocumentJson({ chunks: [] }),
        documentObjects: encodeDocumentJson({ objects: [] }),
      },
      {
        sheetId: 77,
        documentRevision: 2,
        documentMaxRow: 5,
        documentMaxColumn: 2,
        documentChunks: encodeDocumentJson({ chunks: [] }),
        documentObjects: encodeDocumentJson({ objects: [] }),
      },
    ]);
    mocks.workbookFindFirst.mockResolvedValueOnce({ id: 9 });
    mocks.sheetFindMany.mockResolvedValueOnce([
      { id: 15, order: 0 },
      { id: 18, order: 1 },
    ]);
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
    expect(mocks.sheetUpdate).toHaveBeenCalledWith({
      where: { id: 15 },
      data: {
        documentFormat: "openexcel-document-v1",
        documentVersion: 1,
        documentRevision: 3,
        maxRow: 10,
        maxColumn: 4,
      },
    });
    expect(mocks.sheetDelete).toHaveBeenCalledWith({ where: { id: 77 } });
    expect(mocks.sessionUpdate).toHaveBeenCalledWith({
      where: { id: 6 },
      data: { chatMessages: "[]" },
    });
  });
});
