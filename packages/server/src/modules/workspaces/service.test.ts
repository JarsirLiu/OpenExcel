import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findWorkspaces: vi.fn(),
  findWorkspace: vi.fn(),
  transaction: vi.fn(),
  workspaceAggregate: vi.fn(),
  workspaceCreate: vi.fn(),
  workbookCreate: vi.fn(),
  sheetCreate: vi.fn(),
  sessionCreate: vi.fn(),
  ensureInitialWorkspace: vi.fn(),
}));

vi.mock("./repository.js", () => ({
  findWorkspaces: mocks.findWorkspaces,
  findWorkspace: mocks.findWorkspace,
}));

vi.mock("../../infra/database/db.js", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

vi.mock("./application/ensureInitialWorkspace.js", () => ({
  ensureInitialWorkspace: mocks.ensureInitialWorkspace,
}));

import {
  ensureWorkspaceForUser,
  getWorkspaces,
  requireWorkspace,
  WorkspaceNotFoundError,
} from "./service.js";

describe("workspace service scoping", () => {
  beforeEach(() => {
    mocks.findWorkspaces.mockReset();
    mocks.findWorkspace.mockReset();
    mocks.transaction.mockReset();
    mocks.workspaceAggregate.mockReset();
    mocks.workspaceCreate.mockReset();
    mocks.workbookCreate.mockReset();
    mocks.sheetCreate.mockReset();
    mocks.sessionCreate.mockReset();
    mocks.ensureInitialWorkspace.mockReset();
  });

  it("loads workspaces only for the current user", async () => {
    mocks.findWorkspaces.mockResolvedValue([{ id: 1 }]);

    await getWorkspaces(42);

    expect(mocks.findWorkspaces).toHaveBeenCalledWith(42);
  });

  it("initializes a workspace before returning an empty user's workspaces", async () => {
    mocks.findWorkspaces.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 8 }]);
    mocks.ensureInitialWorkspace.mockResolvedValueOnce({ seeded: true, workspaceId: 8 });

    const workspaces = await getWorkspaces(42);

    expect(mocks.ensureInitialWorkspace).toHaveBeenCalledWith(42);
    expect(workspaces).toEqual([{ id: 8 }]);
    expect(mocks.findWorkspaces).toHaveBeenCalledTimes(2);
  });

  it("does not initialize an existing user's workspaces", async () => {
    mocks.findWorkspaces.mockResolvedValueOnce([{ id: 1 }]);

    await getWorkspaces(42);

    expect(mocks.ensureInitialWorkspace).not.toHaveBeenCalled();
  });

  it("throws when a workspace does not belong to the current user", async () => {
    mocks.findWorkspace.mockResolvedValue(null);

    await expect(requireWorkspace(8, 42)).rejects.toBeInstanceOf(WorkspaceNotFoundError);
    expect(mocks.findWorkspace).toHaveBeenCalledWith(8, 42);
  });

  it("returns the first workspace when one already exists", async () => {
    mocks.findWorkspaces.mockResolvedValueOnce([{ id: 3 }]);

    const existing = await ensureWorkspaceForUser(42);

    expect(existing).toEqual({ id: 3 });
    expect(mocks.findWorkspaces).toHaveBeenCalledWith(42);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("creates a workspace bundle when none exists", async () => {
    mocks.findWorkspaces.mockResolvedValueOnce([]);
    mocks.transaction.mockImplementationOnce(async (callback: (tx: any) => Promise<any>) =>
      callback({
        workspace: {
          aggregate: mocks.workspaceAggregate,
          create: mocks.workspaceCreate,
        },
        workbook: {
          create: mocks.workbookCreate,
        },
        sheet: {
          create: mocks.sheetCreate,
        },
        session: {
          create: mocks.sessionCreate,
        },
      }),
    );
    mocks.workspaceAggregate.mockResolvedValueOnce({ _max: { order: 8 } });
    mocks.workspaceCreate.mockResolvedValueOnce({ id: 9, name: "新工作区", order: 9 });
    mocks.workbookCreate.mockResolvedValueOnce({ id: 10, name: "New Workbook", order: 9 });
    mocks.sheetCreate.mockResolvedValueOnce({ id: 11, sheetNo: 1, name: "Sheet1", order: 0 });
    mocks.sessionCreate.mockResolvedValueOnce({
      id: 12,
      workspaceId: 9,
      name: "新对话",
      sheetId: null,
    });

    const created = (await ensureWorkspaceForUser(77)) as any;

    expect(created.workspace).toEqual({ id: 9, name: "新工作区", order: 9 });
    expect(created.workbook.id).toBe(10);
    expect(created.workbook.initialSheet.id).toBe(11);
    expect(created.session.id).toBe(12);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});
