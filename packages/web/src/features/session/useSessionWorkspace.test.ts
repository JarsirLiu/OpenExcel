import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionWorkspace } from "./useSessionWorkspace";

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  fetchMessages: vi.fn(),
  fetchSessions: vi.fn(),
  generateSessionTitle: vi.fn(),
}));

vi.mock("@/api/sessions", () => ({
  createSession: mocks.createSession,
  deleteSession: mocks.deleteSession,
  fetchSessions: mocks.fetchSessions,
  generateSessionTitle: mocks.generateSessionTitle,
}));

vi.mock("@/api/chat", () => ({
  fetchMessages: mocks.fetchMessages,
}));

describe("useSessionWorkspace", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.createSession.mockReset();
    mocks.deleteSession.mockReset();
    mocks.fetchMessages.mockReset();
    mocks.fetchSessions.mockReset();
    mocks.generateSessionTitle.mockReset();
  });

  it("keeps the draft session mounted while the first message is being sent", async () => {
    mocks.createSession.mockResolvedValue({
      id: 5,
      publicId: "session-5",
      sheetId: null,
      name: "新对话",
      createdAt: "2026-07-07T00:00:00.000Z",
    });
    mocks.fetchMessages.mockResolvedValue({ messages: [], total: 0 });

    const { result } = renderHook(() => useSessionWorkspace(1, undefined, {
      sessions: [],
      messages: [],
      messageTotal: 0,
    }));

    await act(async () => {
      await result.current.handleSendInDraft("帮我汇总这份表格");
    });

    await waitFor(() => {
      expect(result.current.currentSessionId).toBe(5);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.initialLoaded).toBe(true);
    expect(result.current.sessions.map((session) => session.id)).toEqual([5]);
    expect(result.current.claimPendingDraftText(5)).toBe("帮我汇总这份表格");
    expect(result.current.claimPendingDraftText(5)).toBeNull();
    expect(mocks.fetchMessages).not.toHaveBeenCalled();
  });

  it("loads message history when switching to an existing session", async () => {
    mocks.fetchMessages.mockResolvedValue({
      messages: [{ id: "message-1", role: "user", parts: [{ type: "text", text: "你好" }] }],
      total: 1,
    });

    const { result } = renderHook(() => useSessionWorkspace(1, undefined, {
      sessions: [
        {
          id: 1,
          publicId: "session-1",
          sheetId: null,
          name: "会话 1",
          createdAt: "2026-07-07T00:00:00.000Z",
        },
        {
          id: 2,
          publicId: "session-2",
          sheetId: null,
          name: "会话 2",
          createdAt: "2026-07-07T00:00:00.000Z",
        },
      ],
      messages: [],
      messageTotal: 0,
    }));

    act(() => {
      result.current.handleSelectSession(2);
    });

    await waitFor(() => {
      expect(mocks.fetchMessages).toHaveBeenCalledWith(1, 2, 40, 0);
    });

    await waitFor(() => {
      expect(result.current.messages).toEqual([
        { id: "message-1", role: "user", parts: [{ type: "text", text: "你好" }] },
      ]);
      expect(result.current.messageTotal).toBe(1);
    });
  });
});
