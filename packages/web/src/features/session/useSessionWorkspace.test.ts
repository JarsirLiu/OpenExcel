import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  beforeEach(() => {
    sessionStorage.clear();
    mocks.createSession.mockReset();
    mocks.deleteSession.mockReset();
    mocks.fetchSessions.mockReset();
    mocks.generateSessionTitle.mockReset();
  });

  it("creates a session for draft", async () => {
    mocks.createSession.mockResolvedValue({
      id: 5,
      publicId: "session-5",
      sheetId: null,
      name: "新对话",
      createdAt: "2026-07-07T00:00:00.000Z",
    });

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

    expect(result.current.sessions.map((session) => session.id)).toEqual([5]);
  });
});