import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/api/sessions";
import { useSessionWorkspace } from "./useSessionWorkspace";

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  fetchSessions: vi.fn(),
  generateSessionTitle: vi.fn(),
}));

vi.mock("@/api/sessions", () => ({
  createSession: mocks.createSession,
  deleteSession: mocks.deleteSession,
  fetchSessions: mocks.fetchSessions,
  generateSessionTitle: mocks.generateSessionTitle,
}));

describe("useSessionWorkspace", () => {
  const emptyInitial = {
    sessions: [],
  };

  beforeEach(() => {
    sessionStorage.clear();
    mocks.createSession.mockReset();
    mocks.deleteSession.mockReset();
    mocks.fetchSessions.mockReset();
    mocks.generateSessionTitle.mockReset();
    mocks.fetchSessions.mockResolvedValue([]);
  });

  it("creates and activates a formal session without refreshing the list", async () => {
    const session = {
      id: 5,
      publicId: "session-5",
      sheetId: null,
      name: "新对话",
      createdAt: "2026-07-14T00:00:00.000Z",
    };
    mocks.createSession.mockResolvedValue(session);
    const { result } = renderHook(() => useSessionWorkspace(1, undefined, emptyInitial));

    let created: Session | undefined;
    await act(async () => {
      created = await result.current.createSession();
      result.current.activateSession(5);
    });

    expect(created).toEqual(session);
    expect(result.current.currentSessionId).toBe(5);
    expect(mocks.fetchSessions).not.toHaveBeenCalled();

    expect(result.current.sessions.map((session) => session.id)).toEqual([5]);
  });

  it("creates and activates a formal session when starting a new chat", async () => {
    const session = {
      id: 7,
      publicId: "session-7",
      sheetId: null,
      name: "新对话",
      createdAt: "2026-07-14T00:00:00.000Z",
    };
    mocks.createSession.mockResolvedValue(session);
    const { result } = renderHook(() =>
      useSessionWorkspace(1, undefined, {
        sessions: [{ ...session, id: 6, publicId: "session-6", name: "旧会话" }],
      }),
    );

    act(() => {
      result.current.handleNewSession();
    });

    await waitFor(() => expect(result.current.currentSessionId).toBe(7));
    expect(mocks.createSession).toHaveBeenCalledWith(1);
    expect(result.current.sessions.map((item) => item.id)).toEqual([7, 6]);
    expect(result.current.isCreatingSession).toBe(false);
  });

  it("exposes a creation error when starting a new chat fails", async () => {
    mocks.createSession.mockRejectedValue(new Error("服务不可用"));
    const { result } = renderHook(() => useSessionWorkspace(1, undefined, emptyInitial));

    act(() => {
      result.current.handleNewSession();
    });

    await waitFor(() => expect(result.current.sessionError?.message).toBe("服务不可用"));
    expect(result.current.currentSessionId).toBeNull();
    expect(result.current.isCreatingSession).toBe(false);
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
      firstRefresh = result.current.refreshSessions();
      secondRefresh = result.current.refreshSessions();
    });

    expect(mocks.fetchSessions).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch?.([session]);
      await Promise.all([firstRefresh, secondRefresh]);
    });

    expect(result.current.sessions).toEqual([session]);
  });

  it("keeps the selected session when a list refresh temporarily omits it", async () => {
    const selected = {
      id: 12,
      publicId: "session-12",
      sheetId: null,
      name: "当前会话",
      createdAt: "2026-07-14T00:00:00.000Z",
    };
    mocks.fetchSessions.mockResolvedValue([]);
    const { result } = renderHook(() =>
      useSessionWorkspace(1, undefined, { sessions: [selected] }),
    );

    act(() => {
      result.current.handleSelectSession(selected.id);
    });
    expect(result.current.currentSessionId).toBe(selected.id);

    await act(async () => {
      await result.current.refreshSessions();
    });

    expect(result.current.currentSessionId).toBe(selected.id);
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

  it("refreshes session metadata after undo succeeds", async () => {
    const onWorkspaceRefresh = vi.fn().mockResolvedValue(undefined);
    mocks.fetchSessions.mockResolvedValue([
      {
        id: 10,
        publicId: "session-10",
        sheetId: null,
        name: "已撤销",
        undoRunId: null,
        createdAt: "2026-07-14T00:00:00.000Z",
      },
    ]);
    const { result } = renderHook(() =>
      useSessionWorkspace(1, onWorkspaceRefresh, {
        sessions: [
          {
            id: 10,
            publicId: "session-10",
            sheetId: null,
            name: "待撤销",
            undoRunId: 31,
            createdAt: "2026-07-14T00:00:00.000Z",
          },
        ],
      }),
    );

    await act(async () => {
      await result.current.handleUndoComplete();
    });

    expect(onWorkspaceRefresh).toHaveBeenCalledOnce();
    expect(result.current.sessions[0]?.undoRunId).toBeNull();
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
