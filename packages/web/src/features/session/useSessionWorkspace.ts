import { useCallback, useEffect, useState } from "react";
import {
  createSession,
  deleteSession,
  fetchSessions,
  generateSessionTitle,
  type Session,
} from "@/api/sessions";
import { fetchMessages as fetchChatMessages, undoLatestRun as undoLatestChatRun } from "@/api/chat";
import { getFirstUserText } from "./utils";

type UndoState = "idle" | "loading" | "success" | "error";

export function useSessionWorkspace(workspaceId: number | null, onUndoComplete?: () => void) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [initialMessages, setInitialMessages] = useState<any[]>([]);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [undoState, setUndoState] = useState<UndoState>("idle");
  const [undoError, setUndoError] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const refreshSessions = useCallback(async () => {
    if (workspaceId == null) {
      setSessions([]);
      setCurrentSessionId(null);
      return [];
    }

    const list = await fetchSessions(workspaceId);

    setSessions(list);
    setCurrentSessionId((prev) => {
      if (prev !== null && list.some((session) => session.id === prev)) {
        return prev;
      }
      return list[0]?.id ?? null;
    });
    return list;
  }, [workspaceId]);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    let cancelled = false;
    setInitialLoaded(false);

    const loadInitialMessages = async () => {
      try {
        if (workspaceId != null && currentSessionId) {
          const msgs = await fetchChatMessages(workspaceId, currentSessionId);
          if (!cancelled) {
            setInitialMessages(msgs);
          }
        } else if (!cancelled) {
          setInitialMessages([]);
        }
      } finally {
        if (!cancelled) {
          setInitialLoaded(true);
        }
      }
    };

    void loadInitialMessages();
    return () => {
      cancelled = true;
    };
  }, [currentSessionId, workspaceId]);

  useEffect(() => {
    setUndoState("idle");
    setUndoError("");
  }, [currentSessionId]);

  useEffect(() => {
    if (undoState !== "success") return;
    const timer = window.setTimeout(() => setUndoState("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [undoState]);

  const handleNewSession = useCallback(async () => {
    if (workspaceId == null) return;
    const session = await createSession(workspaceId);
    setSessions((prev) => [session, ...prev.filter((item) => item.id !== session.id)]);
    setCurrentSessionId(session.id);
    setHistoryOpen(false);
  }, [workspaceId]);

  const handleSelectSession = useCallback((id: number) => {
    setCurrentSessionId(id);
    setHistoryOpen(false);
  }, []);

  const handleDeleteSession = useCallback(async (id: number) => {
    if (workspaceId == null) return;
    await deleteSession(workspaceId, id);
    await refreshSessions();
  }, [refreshSessions, workspaceId]);

  const handleRunComplete = useCallback(async (sessionId: number, finishedMessages: any[]) => {
    const firstUserText = getFirstUserText(finishedMessages).trim();
    try {
      if (firstUserText) {
        if (workspaceId != null) {
          await generateSessionTitle(workspaceId, sessionId, firstUserText);
        }
      }
    } catch (error) {
      console.error("[session] Failed to generate session title:", error);
    }

    try {
      await refreshSessions();
    } catch (error) {
      console.error("[session] Failed to refresh sessions after title update:", error);
    }
  }, [refreshSessions, workspaceId]);

  const handleUndoLatestRun = useCallback(async () => {
    if (!currentSessionId || undoState === "loading" || isStreaming) return;
    if (workspaceId == null) return;
    setUndoState("loading");
    setUndoError("");
    try {
      await undoLatestChatRun(workspaceId, currentSessionId);
      setUndoState("success");
      onUndoComplete?.();
    } catch (error) {
      setUndoState("error");
      setUndoError(error instanceof Error ? error.message : "撤销本轮修改失败");
    }
  }, [currentSessionId, isStreaming, onUndoComplete, undoState, workspaceId]);

  return {
    sessions,
    currentSessionId,
    initialMessages,
    initialLoaded,
    historyOpen,
    setHistoryOpen,
    undoState,
    undoError,
    isStreaming,
    setIsStreaming,
    refreshSessions,
    handleRunComplete,
    handleNewSession,
    handleSelectSession,
    handleDeleteSession,
    handleUndoLatestRun,
  };
}
