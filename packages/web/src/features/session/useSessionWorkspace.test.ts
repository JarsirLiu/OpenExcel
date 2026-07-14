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

  it("shares one in-flight session refresh across concurrent callers", async () => {
    const session = {
      id: 6,
      publicId: "session-6",
      sheetId: null,
      name: "并发刷新",
      createdAt: "2026-07-14T00:00:00.000Z",
    };
    let resolveFetch: ((sessions: (typeof session)[]) => void) | undefined;
    mocks.fetchSessions.mockImplementation(
      () =>
        new Promise<(typeof session)[]>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const { result } = renderHook(() => useSessionWorkspace(1, undefined, emptyInitial));

    let firstRefresh: Promise<unknown> | undefined;
    let secondRefresh: Promise<unknown> | undefined;
    act(() => {
      firstRefresh = result.current.refreshSessions({ preserveCurrent: true });
      secondRefresh = result.current.refreshSessions({ preserveCurrent: true });
    });

    expect(mocks.fetchSessions).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch?.([session]);
      await Promise.all([firstRefresh, secondRefresh]);
    });

    expect(result.current.sessions).toEqual([session]);
  });

  it("replaces a stale background refresh before activating a newly created draft", async () => {
    const session = {
      id: 7,
      publicId: "session-7",
      sheetId: null,
      name: "新建会话",
      createdAt: "2026-07-14T00:00:00.000Z",
    };
    let resolveBackgroundRefresh: ((sessions: (typeof session)[]) => void) | undefined;
    let backgroundSignal: AbortSignal | undefined;
    mocks.fetchSessions
      .mockImplementationOnce((_workspaceId: number, options?: { signal?: AbortSignal }) => {
        backgroundSignal = options?.signal;
        return new Promise<(typeof session)[]>((resolve) => {
          resolveBackgroundRefresh = resolve;
        });
      })
      .mockResolvedValueOnce([session]);
    const { result } = renderHook(() => useSessionWorkspace(1, undefined, emptyInitial));

    let activateDraft: Promise<void> | undefined;
    act(() => {
      void result.current.refreshSessions({ preserveCurrent: true });
      activateDraft = result.current.handleDraftSessionCreated(7);
    });

    expect(mocks.fetchSessions).toHaveBeenCalledTimes(2);
    expect(backgroundSignal?.aborted).toBe(true);

    await act(async () => {
      resolveBackgroundRefresh?.([]);
      await activateDraft;
    });

    expect(result.current.sessions).toEqual([session]);
    expect(result.current.currentSessionId).toBe(7);
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
