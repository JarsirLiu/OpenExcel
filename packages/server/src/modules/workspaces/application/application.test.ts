import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findWorkspaces: vi.fn(),
  findWorkspace: vi.fn(),
  countWorkspaces: vi.fn(),
  renameWorkspace: vi.fn(),
  deleteWorkspace: vi.fn(),
  ensureInitialWorkspace: vi.fn(),
  provisionWorkspaceResources: vi.fn(),
}));

vi.mock("../infrastructure/workspaceRepository.js", () => ({
  findWorkspaces: mocks.findWorkspaces,
  findWorkspace: mocks.findWorkspace,
  countWorkspaces: mocks.countWorkspaces,
  renameWorkspace: mocks.renameWorkspace,
  deleteWorkspace: mocks.deleteWorkspace,
}));

vi.mock("../infrastructure/workspaceProvisioner.js", () => ({
  provisionWorkspaceResources: mocks.provisionWorkspaceResources,
}));

vi.mock("./ensureInitialWorkspace.js", () => ({
  ensureInitialWorkspace: mocks.ensureInitialWorkspace,
}));

vi.mock("../infrastructure/exampleWorkspaceProvisioner.js", () => ({
  exampleWorkspaceProvisioner: {},
}));

import { WorkspaceNotFoundError } from "../domain/workspaceErrors.js";
import { createWorkspace } from "./createWorkspace.js";
import {
  bootstrapWorkspace,
  deleteWorkspace,
  ensureWorkspaceForUser,
  listWorkspaces,
  renameWorkspace,
  requireWorkspace,
} from "./index.js";

describe("workspace application", () => {
  beforeEach(() => {
    mocks.findWorkspaces.mockReset();
    mocks.findWorkspace.mockReset();
    mocks.countWorkspaces.mockReset();
    mocks.renameWorkspace.mockReset();
    mocks.deleteWorkspace.mockReset();
    mocks.ensureInitialWorkspace.mockReset();
    mocks.provisionWorkspaceResources.mockReset();
  });

  it("loads workspaces only for the current user", async () => {
    mocks.findWorkspaces.mockResolvedValue([{ id: 1 }]);

    await listWorkspaces(42);

    expect(mocks.findWorkspaces).toHaveBeenCalledWith(42);
  });

  it("keeps workspace listing read-only", async () => {
    mocks.findWorkspaces.mockResolvedValueOnce([]);

    const workspaces = await listWorkspaces(42);

    expect(workspaces).toEqual([]);
    expect(mocks.ensureInitialWorkspace).not.toHaveBeenCalled();
    expect(mocks.findWorkspaces).toHaveBeenCalledTimes(1);
  });

  it("bootstraps and returns the user's first workspace", async () => {
    mocks.ensureInitialWorkspace.mockResolvedValueOnce({ seeded: true, workspaceId: 8 });
    mocks.findWorkspaces.mockResolvedValueOnce([{ id: 8 }]);

    const workspace = await bootstrapWorkspace(42);

    expect(workspace).toEqual({ id: 8 });
    expect(mocks.ensureInitialWorkspace).toHaveBeenCalledWith(42, expect.anything());
    expect(mocks.findWorkspaces).toHaveBeenCalledWith(42);
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
  });

  it("creates a workspace bundle when none exists", async () => {
    mocks.findWorkspaces.mockResolvedValueOnce([]);
    mocks.provisionWorkspaceResources.mockResolvedValueOnce({
      workspace: { id: 9, name: "新工作区", order: 9 },
      workbook: { id: 10, initialSheet: { id: 11 } },
    });

    const created = await createWorkspace(77);

    expect(created.workspace).toEqual({ id: 9, name: "新工作区", order: 9 });
    expect(created.workbook.id).toBe(10);
    expect(created.workbook.initialSheet.id).toBe(11);
    expect(mocks.provisionWorkspaceResources).toHaveBeenCalledWith(77, "新项目");
  });

  it("trims a workspace name before updating an owned workspace", async () => {
    mocks.findWorkspace.mockResolvedValueOnce({ id: 5, ownerUserId: 42 });
    mocks.renameWorkspace.mockResolvedValueOnce({ id: 5, name: "新名称" });

    await expect(renameWorkspace(5, 42, "  新名称  ")).resolves.toEqual({
      id: 5,
      name: "新名称",
    });
    expect(mocks.renameWorkspace).toHaveBeenCalledWith(5, "新名称");
  });

  it("rejects deleting the last workspace", async () => {
    mocks.findWorkspace.mockResolvedValueOnce({ id: 5, ownerUserId: 42 });
    mocks.countWorkspaces.mockResolvedValueOnce(1);

    await expect(deleteWorkspace(5, 42)).rejects.toMatchObject({
      message: "Cannot delete the last workspace",
      statusCode: 400,
    });
    expect(mocks.deleteWorkspace).not.toHaveBeenCalled();
  });
});
