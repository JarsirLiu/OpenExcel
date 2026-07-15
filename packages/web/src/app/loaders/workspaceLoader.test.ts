import type { LoaderFunctionArgs } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchWorkbook, fetchSessions, fetchWorkbooks, fetchWorkspaces } = vi.hoisted(() => ({
  fetchWorkbook: vi.fn(),
  fetchSessions: vi.fn(),
  fetchWorkbooks: vi.fn(),
  fetchWorkspaces: vi.fn(),
}));

vi.mock("@/api/sessions", () => ({ fetchSessions }));
vi.mock("@/api/workbooks", () => ({ fetchWorkbook, fetchWorkbooks }));
vi.mock("@/api/workspaces", () => ({ fetchWorkspaces }));

import { workspaceLoader } from "./workspaceLoader";

function loaderArgs(params: LoaderFunctionArgs["params"]): LoaderFunctionArgs {
  return { params } as LoaderFunctionArgs;
}

describe("workspaceLoader", () => {
  beforeEach(() => {
    fetchSessions.mockReset();
    fetchWorkbook.mockReset();
    fetchWorkbooks.mockReset();
    fetchWorkspaces.mockReset();
    fetchWorkspaces.mockResolvedValue([{ id: 11, publicId: "ws_test", name: "Test", order: 0 }]);
    fetchWorkbooks.mockResolvedValue([]);
    fetchSessions.mockResolvedValue([]);
    fetchWorkbook.mockResolvedValue(null);
  });

  it("loads the requested workspace data without bootstrapping", async () => {
    const result = await workspaceLoader(loaderArgs({ workspacePublicId: "ws_test" }));

    expect(result).toEqual({
      workspaces: [{ id: 11, publicId: "ws_test", name: "Test", order: 0 }],
      workspace: { id: 11, publicId: "ws_test", name: "Test", order: 0 },
      workbooks: [],
      sessions: [],
      currentWorkbook: null,
    });
    expect(fetchWorkspaces).toHaveBeenCalledTimes(1);
  });
});
