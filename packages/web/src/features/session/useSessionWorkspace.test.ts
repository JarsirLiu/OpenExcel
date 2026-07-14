import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionWorkspace } from "./useSessionWorkspace";

const mocks = vi.hoisted(() => ({
  deleteSession: vi.fn(),
  fetchSessions: vi.fn(),
  generateSessionTitle: vi.fn(),
}));

vi.mock("@/api/sessions", () => ({
  deleteSession: mocks.deleteSession,
  fetchSessions: mocks.fetchSessions,
  generateSessionTitle: mocks.generateSessionTitle,
}));

describe("useSessionWorkspace", () => {
  const emptyInitial = {
    sessions: [],
    messages: [],
    messageTotal: 0,
  };

  beforeEach(() => {
    sessionStorage.clear();
    mocks.deleteSession.mockReset();
    mocks.fetchSessions.mockReset();
    mocks.generateSessionTitle.mockReset();
    mocks.fetchSessions.mockResolvedValue([]);
  });

  it("attaches a server-created session to the draft", async () => {
    mocks.fetchSessions.mockResolvedValue([
      {
        id: 5,
        publicId: "session-5",
        sheetId: null,
        name: "你好",
        createdAt: "2026-07-14T00:00:00.000Z",
      },
    ]);
    const { result } = renderHook(() => useSessionWorkspace(1, undefined, emptyInitial));

    await act(async () => {
      await result.current.handleDraftSessionCreated(5);
    });

    await waitFor(() => {
      expect(result.current.currentSessionId).toBe(5);
    });

    expect(result.current.sessions.map((session) => session.id)).toEqual([5]);
  });

  it("opens a project on a new draft instead of selecting history", async () => {
    const history = {
      id: 9,
      publicId: "session-9",
      sheetId: null,
      name: "历史对话",
      createdAt: "2026-07-07T00:00:00.000Z",
    };

    const { result } = renderHook(() => useSessionWorkspace(1, undefined, { sessions: [history] }));

    await waitFor(() => {
      expect(result.current.sessions).toEqual([history]);
    });

    expect(result.current.currentSessionId).toBeNull();
  });

  it("does not reuse a session from the previous workspace", async () => {
    mocks.fetchSessions.mockImplementation(async (workspaceId: number) =>
      workspaceId === 2
        ? [
            {
              id: 8,
              publicId: "session-8",
              sheetId: null,
              name: "工作区 2",
              createdAt: "2026-07-07T00:00:00.000Z",
            },
          ]
        : [],
    );

    const { result, rerender } = renderHook(({ workspaceId }) => useSessionWorkspace(workspaceId), {
      initialProps: { workspaceId: 1 },
    });

    await act(async () => {
      rerender({ workspaceId: 2 });
    });

    await waitFor(() => {
      expect(result.current.sessions.map((session) => session.id)).toEqual([8]);
    });
    expect(result.current.currentSessionId).toBeNull();
    expect(mocks.fetchSessions).toHaveBeenCalledWith(
      2,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
