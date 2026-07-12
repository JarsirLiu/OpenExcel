import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  workspaceAggregate: vi.fn(),
  workspaceCreate: vi.fn(),
  workbookCreate: vi.fn(),
  sheetCreate: vi.fn(),
  sheetChunkCreate: vi.fn(),
  sheetObjectCreate: vi.fn(),
  sessionCreate: vi.fn(),
}));

vi.mock("../../infra/database/db.js", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

import { seedExampleWorkspaceForUser } from "./exampleSeed.js";

describe("seedExampleWorkspaceForUser", () => {
  beforeEach(() => {
    mocks.transaction.mockReset();
    mocks.userFindUnique.mockReset();
    mocks.userUpdate.mockReset();
    mocks.workspaceAggregate.mockReset();
    mocks.workspaceCreate.mockReset();
    mocks.workbookCreate.mockReset();
    mocks.sheetCreate.mockReset();
    mocks.sheetChunkCreate.mockReset();
    mocks.sheetObjectCreate.mockReset();
    mocks.sessionCreate.mockReset();
  });

  it("creates an example workspace bundle from the template when the user has none", async () => {
    mocks.transaction.mockImplementationOnce(async (callback: (tx: any) => Promise<any>) =>
      callback({
        user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate },
        workspace: { aggregate: mocks.workspaceAggregate, create: mocks.workspaceCreate },
        workbook: { create: mocks.workbookCreate },
        sheet: { create: mocks.sheetCreate },
        sheetChunk: { create: mocks.sheetChunkCreate },
        sheetObject: { create: mocks.sheetObjectCreate },
        session: { create: mocks.sessionCreate },
      }),
    );
    mocks.userFindUnique.mockResolvedValueOnce({
      id: 8,
      exampleWorkspaceSeededAt: null,
      workspaces: [],
    });
    mocks.workspaceAggregate.mockResolvedValueOnce({ _max: { order: -1 } });
    mocks.workspaceCreate.mockResolvedValueOnce({ id: 100 });
    mocks.workbookCreate
      .mockResolvedValueOnce({ id: 200, name: "经营概览" })
      .mockResolvedValueOnce({ id: 201, name: "销售情况分析" });
    mocks.sheetCreate
      .mockResolvedValueOnce({ id: 300, sheetNo: 1, name: "概述", order: 0 })
      .mockResolvedValueOnce({ id: 301, sheetNo: 1, name: "季度销售", order: 0 });
    mocks.sessionCreate.mockResolvedValueOnce({ id: 400 });
    mocks.userUpdate.mockResolvedValueOnce({ id: 8 });

    const result = await seedExampleWorkspaceForUser(8, {
      workbooks: [
        {
          name: "经营概览",
          sheets: [
            {
              name: "概述",
              columns: [
                { label: "指标名称", width: 280 },
                { label: "数值/说明", width: 200 },
              ],
              rows: [["A", "1"]],
              merges: [],
            },
          ],
        },
        {
          name: "销售情况分析",
          sheets: [
            {
              name: "季度销售",
              columns: [{ label: "季度", width: 160 }],
              rows: [["2026年第一季度"]],
            },
          ],
        },
      ],
    });

    expect(result).toEqual({ seeded: true, workspaceId: 100 });
    expect(mocks.workspaceCreate).toHaveBeenCalledWith({
      data: {
        ownerUserId: 8,
        name: "示例项目",
        order: 0,
        publicId: expect.stringMatching(/^ws_[0-9a-f]{12}$/),
      },
    });
    expect(mocks.workbookCreate).toHaveBeenCalledTimes(2);
    expect(mocks.sheetCreate).toHaveBeenCalledTimes(2);
    expect(mocks.sessionCreate).toHaveBeenCalledWith({
      data: {
        workspaceId: 100,
        name: "新对话",
        sheetId: null,
        publicId: expect.stringMatching(/^ss_[0-9a-f]{12}$/),
      },
    });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: 8 },
      data: { exampleWorkspaceSeededAt: expect.any(Date) },
    });

    const firstSheetData = mocks.sheetCreate.mock.calls[0][0].data;
    expect(firstSheetData.columns).toContain("指标名称");
    expect(mocks.sheetChunkCreate).toHaveBeenCalled();
  });

  it("marks an existing user as seeded without creating an example workspace", async () => {
    mocks.transaction.mockImplementationOnce(async (callback: (tx: any) => Promise<any>) =>
      callback({
        user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate },
        workspace: { aggregate: mocks.workspaceAggregate, create: mocks.workspaceCreate },
        workbook: { create: mocks.workbookCreate },
        sheet: { create: mocks.sheetCreate },
        sheetChunk: { create: mocks.sheetChunkCreate },
        sheetObject: { create: mocks.sheetObjectCreate },
        session: { create: mocks.sessionCreate },
      }),
    );
    mocks.userFindUnique.mockResolvedValueOnce({
      id: 9,
      exampleWorkspaceSeededAt: null,
      workspaces: [{ id: 77 }],
    });
    mocks.userUpdate.mockResolvedValueOnce({ id: 9 });

    const result = await seedExampleWorkspaceForUser(9, { workbooks: [] });

    expect(result).toEqual({ seeded: false });
    expect(mocks.workspaceCreate).not.toHaveBeenCalled();
    expect(mocks.workbookCreate).not.toHaveBeenCalled();
    expect(mocks.sheetCreate).not.toHaveBeenCalled();
    expect(mocks.sessionCreate).not.toHaveBeenCalled();
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { exampleWorkspaceSeededAt: expect.any(Date) },
    });
  });
});
