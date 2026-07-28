import type { LoaderFunctionArgs } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchSessions, fetchWorkbooks, fetchWorkspaces } = vi.hoisted(() => ({
  fetchSessions: vi.fn(),
  fetchWorkbooks: vi.fn(),
  fetchWorkspaces: vi.fn(),
}));

vi.mock("@/api/sessions", () => ({ fetchSessions }));
vi.mock("@/api/workbooks", () => ({ fetchWorkbooks }));
vi.mock("@/api/workspaces", () => ({ fetchWorkspaces }));

import { workspaceLoader } from "./workspaceLoader";

function loaderArgs(params: LoaderFunctionArgs["params"]): LoaderFunctionArgs {
  return {
    params,
    request: new Request("http://localhost/workspaces/ws_test"),
  } as LoaderFunctionArgs;
}

describe("workspaceLoader", () => {
  beforeEach(() => {
    fetchSessions.mockReset();
    fetchWorkbooks.mockReset();
    fetchWorkspaces.mockReset();
    fetchWorkspaces.mockResolvedValue([{ id: 11, publicId: "ws_test", name: "Test", order: 0 }]);
    fetchWorkbooks.mockResolvedValue([]);
    fetchSessions.mockResolvedValue([]);
  });

  it("loads the requested workspace data without bootstrapping", async () => {
    const result = await workspaceLoader(loaderArgs({ workspacePublicId: "ws_test" }));

    expect(result).toEqual({
      workspaces: [{ id: 11, publicId: "ws_test", name: "Test", order: 0 }],
      workspace: { id: 11, publicId: "ws_test", name: "Test", order: 0 },
      workbooks: [],
      sessions: [],
    });
    expect(fetchWorkspaces).toHaveBeenCalledWith(
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(fetchWorkbooks).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(fetchSessions).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
