import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkbookMeta } from "@/api/workbooks";
import type { Workspace } from "@/api/workspaces";

const { deleteWorkspace, fetchWorkbooks, fetchWorkspaces } = vi.hoisted(() => ({
  deleteWorkspace: vi.fn(),
  fetchWorkbooks: vi.fn(),
  fetchWorkspaces: vi.fn(),
}));

vi.mock("@/api/workbooks", () => ({ fetchWorkbooks }));
vi.mock("@/api/workspaces", () => ({ deleteWorkspace, fetchWorkspaces }));

import { useWorkspaceState } from "./useWorkspaceState";

const workspace: Workspace = {
  id: 1,
  publicId: "workspace-1",
  name: "Workspace",
  order: 0,
};
const workspaces = [workspace];

const workbook = (id: number): WorkbookMeta => ({
  id,
  publicId: `workbook-${id}`,
  name: `Workbook ${id}`,
  order: 0,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("useWorkspaceState", () => {
  beforeEach(() => {
    fetchWorkbooks.mockReset();
    fetchWorkspaces.mockReset();
    deleteWorkspace.mockReset();
  });

  it("discards an older catalog response when a refresh starts", async () => {
    const initialRequest = deferred<WorkbookMeta[]>();
    const refreshRequest = deferred<WorkbookMeta[]>();
    fetchWorkbooks
      .mockReturnValueOnce(initialRequest.promise)
      .mockReturnValueOnce(refreshRequest.promise);

    const { result } = renderHook(() => useWorkspaceState(workspaces, workspace.id));
    await waitFor(() => expect(fetchWorkbooks).toHaveBeenCalledOnce());

    let refreshPromise: Promise<void> | undefined;
    await act(async () => {
      refreshPromise = result.current.refreshWorkbooks([workspace]);
      await Promise.resolve();
    });

    await act(async () => {
      initialRequest.resolve([workbook(10)]);
      await Promise.resolve();
    });
    expect(result.current.workbooksMap.get(workspace.id)).toBeUndefined();

    await act(async () => {
      refreshRequest.resolve([workbook(20)]);
      await refreshPromise;
    });
    expect(result.current.workbooksMap.get(workspace.id)).toEqual([workbook(20)]);
  });

  it("loads the catalog once when workspaces are refreshed", async () => {
    fetchWorkspaces.mockResolvedValueOnce(workspaces).mockResolvedValueOnce([...workspaces]);
    fetchWorkbooks.mockResolvedValue([workbook(30)]);

    const { result } = renderHook(() => useWorkspaceState());

    await waitFor(() => expect(fetchWorkbooks).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => expect(fetchWorkbooks).toHaveBeenCalledTimes(2));
    expect(fetchWorkbooks).toHaveBeenCalledTimes(2);
  });

  it("clears the active workspace after deleting the last workspace", async () => {
    fetchWorkbooks.mockResolvedValue([]);
    deleteWorkspace.mockResolvedValue(undefined);
    fetchWorkspaces.mockResolvedValueOnce([]);

    const { result } = renderHook(() => useWorkspaceState(workspaces, workspace.id));

    await act(async () => {
      await result.current.removeWorkspace(workspace.id);
    });

    expect(deleteWorkspace).toHaveBeenCalledWith(workspace.id);
    expect(result.current.workspaces).toEqual([]);
    expect(result.current.activeWorkspaceId).toBeNull();
  });
});
