import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSession,
  deleteSession,
  fetchSessions,
  generateSessionTitle,
  type Session,
} from "@/api/sessions";
import { fetchMessages as fetchChatMessages, undoLatestRun as undoLatestChatRun } from "@/api/chat";
import { getFirstUserText } from "./utils";

const PAGE_SIZE = 40;

type UndoState = "idle" | "loading" | "success" | "error";

export function useSessionWorkspace(workspaceId: number | null, onUndoComplete?: () => void) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [messageTotal, setMessageTotal] = useState(0);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [undoState, setUndoState] = useState<UndoState>("idle");
  const [undoError, setUndoError] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [draftPendingText, setDraftPendingText] = useState<string | null>(null);
  const loadedOffsetRef = useRef(0);

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
    setMessages([]);
    setMessageTotal(0);
    loadedOffsetRef.current = 0;

    const loadInitialMessages = async () => {
      try {
        if (workspaceId != null && currentSessionId) {
          const { messages: msgs, total } = await fetchChatMessages(workspaceId, currentSessionId, PAGE_SIZE, 0);
          if (!cancelled) {
            setMessages(msgs);
            setMessageTotal(total);
            loadedOffsetRef.current = msgs.length;
          }
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

  const loadMoreMessages = useCallback(async () => {
    if (!currentSessionId || workspaceId == null || loadingMore) return;
    if (loadedOffsetRef.current >= messageTotal) return;

    setLoadingMore(true);
    try {
      const { messages: olderMsgs } = await fetchChatMessages(
        workspaceId, currentSessionId, PAGE_SIZE, loadedOffsetRef.current,
      );
      setMessages((prev) => [...olderMsgs, ...prev]);
      loadedOffsetRef.current += olderMsgs.length;
    } finally {
      setLoadingMore(false);
    }
  }, [currentSessionId, loadingMore, messageTotal, workspaceId]);

  const ensureSession = useCallback(async () => {
    if (currentSessionId != null) return currentSessionId;
    if (workspaceId == null) throw new Error("No workspace");
    const session = await createSession(workspaceId);
    setCurrentSessionId(session.id);
    setSessions((prev) => [session, ...prev]);
    return session.id;
  }, [currentSessionId, workspaceId]);

  const handleSendInDraft = useCallback(async (text: string) => {
    setDraftPendingText(text);
    if (workspaceId == null) throw new Error("No workspace");
    const session = await createSession(workspaceId);
    setCurrentSessionId(session.id);
    setSessions((prev) => [session, ...prev]);
    return session.id;
  }, [workspaceId]);

  const clearDraftPendingText = useCallback(() => {
    setDraftPendingText(null);
  }, []);

  useEffect(() => {
    setUndoState("idle");
    setUndoError("");
  }, [currentSessionId]);

  useEffect(() => {
    if (undoState !== "success") return;
    const timer = window.setTimeout(() => setUndoState("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [undoState]);

  const handleNewSession = useCallback(() => {
    setCurrentSessionId(null);
    setMessages([]);
    setMessageTotal(0);
    setInitialLoaded(true);
    setHistoryOpen(false);
    setDraftPendingText(null);
  }, []);

  const handleSelectSession = useCallback((id: number) => {
    setCurrentSessionId(id);
    setHistoryOpen(false);
    setDraftPendingText(null);
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

    setMessages(finishedMessages);
    setMessageTotal(finishedMessages.length);
    loadedOffsetRef.current = finishedMessages.length;
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
    messages,
    messageTotal,
    initialLoaded,
    loadingMore,
    historyOpen,
    setHistoryOpen,
    undoState,
    undoError,
    isStreaming,
    setIsStreaming,
    refreshSessions,
    ensureSession,
    loadMoreMessages,
    handleSendInDraft,
    draftPendingText,
    clearDraftPendingText,
    handleRunComplete,
    handleNewSession,
    handleSelectSession,
    handleDeleteSession,
    handleUndoLatestRun,
  };
}