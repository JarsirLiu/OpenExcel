import { useCallback, useEffect, useState } from "react";
import {
  createSession,
  deleteSession,
  fetchMessages,
  fetchSessions,
  undoLatestRun,
  type Session,
} from "../../api/client";

type UndoState = "idle" | "loading" | "success" | "error";

export function useSessionWorkspace(onUndoComplete?: () => void) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [initialMessages, setInitialMessages] = useState<any[]>([]);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [undoState, setUndoState] = useState<UndoState>("idle");
  const [undoError, setUndoError] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const refreshSessions = useCallback(async () => {
    const list = await fetchSessions();
    if (list.length === 0) {
      const session = await createSession();
      setSessions([session]);
      setCurrentSessionId(session.id);
      return [session];
    }

    setSessions(list);
    setCurrentSessionId((prev) => {
      if (prev !== null && list.some((session) => session.id === prev)) {
        return prev;
      }
      return list[0]?.id ?? null;
    });
    return list;
  }, []);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    let cancelled = false;
    setInitialLoaded(false);

    const loadInitialMessages = async () => {
      try {
        if (currentSessionId) {
          const msgs = await fetchMessages(currentSessionId);
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
  }, [currentSessionId]);

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
    const session = await createSession();
    setSessions((prev) => [session, ...prev.filter((item) => item.id !== session.id)]);
    setCurrentSessionId(session.id);
    setHistoryOpen(false);
  }, []);

  const handleSelectSession = useCallback((id: number) => {
    setCurrentSessionId(id);
    setHistoryOpen(false);
  }, []);

  const handleDeleteSession = useCallback(async (id: number) => {
    await deleteSession(id);
    await refreshSessions();
  }, [refreshSessions]);

  const handleUndoLatestRun = useCallback(async () => {
    if (!currentSessionId || undoState === "loading" || isStreaming) return;
    setUndoState("loading");
    setUndoError("");
    try {
      await undoLatestRun(currentSessionId);
      setUndoState("success");
      onUndoComplete?.();
    } catch (error) {
      setUndoState("error");
      setUndoError(error instanceof Error ? error.message : "撤销本轮修改失败");
    }
  }, [currentSessionId, isStreaming, onUndoComplete, undoState]);

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
    handleNewSession,
    handleSelectSession,
    handleDeleteSession,
    handleUndoLatestRun,
  };
}
