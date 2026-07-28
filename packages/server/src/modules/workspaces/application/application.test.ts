import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findWorkspaces: vi.fn(),
  findWorkspace: vi.fn(),
  countWorkspaces: vi.fn(),
  renameWorkspace: vi.fn(),
  deleteWorkspace: vi.fn(),
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

import { WorkspaceNotFoundError } from "../domain/workspaceErrors.js";
import { createWorkspace } from "./createWorkspace.js";
import { deleteWorkspace, listWorkspaces, renameWorkspace, requireWorkspace } from "./index.js";

describe("workspace application", () => {
  beforeEach(() => {
    mocks.findWorkspaces.mockReset();
    mocks.findWorkspace.mockReset();
    mocks.countWorkspaces.mockReset();
    mocks.renameWorkspace.mockReset();
    mocks.deleteWorkspace.mockReset();
    mocks.provisionWorkspaceResources.mockReset();
  });

  it("loads workspaces only for the current user", async () => {
    mocks.findWorkspaces.mockResolvedValue([{ id: 1 }]);
    await listWorkspaces(42);
    expect(mocks.findWorkspaces).toHaveBeenCalledWith(42);
  });

  it("keeps workspace listing read-only", async () => {
    mocks.findWorkspaces.mockResolvedValueOnce([]);
    await expect(listWorkspaces(42)).resolves.toEqual([]);
    expect(mocks.findWorkspaces).toHaveBeenCalledTimes(1);
  });

  it("throws when a workspace does not belong to the current user", async () => {
    mocks.findWorkspace.mockResolvedValue(null);
    await expect(requireWorkspace(8, 42)).rejects.toBeInstanceOf(WorkspaceNotFoundError);
  });

  it("creates only a workspace", async () => {
    mocks.findWorkspaces.mockResolvedValueOnce([]);
    mocks.provisionWorkspaceResources.mockResolvedValueOnce({ id: 9, name: "新工作区", order: 9 });
    const created = await createWorkspace(77);
    expect(created).toEqual({ id: 9, name: "新工作区", order: 9 });
    expect(mocks.provisionWorkspaceResources).toHaveBeenCalledWith(77, "新项目");
  });

  it("trims a workspace name before updating an owned workspace", async () => {
    mocks.findWorkspace.mockResolvedValueOnce({ id: 5, ownerUserId: 42 });
    mocks.renameWorkspace.mockResolvedValueOnce({ id: 5, name: "新名称" });
    await expect(renameWorkspace(5, 42, "  新名称  ")).resolves.toEqual({ id: 5, name: "新名称" });
  });

  it("rejects deleting the last workspace", async () => {
    mocks.findWorkspace.mockResolvedValueOnce({ id: 5, ownerUserId: 42 });
    mocks.countWorkspaces.mockResolvedValueOnce(1);
    await expect(deleteWorkspace(5, 42)).rejects.toMatchObject({
      message: "Cannot delete the last workspace",
      statusCode: 400,
    });
  });
});
