import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSession,
  deleteSession,
  fetchSessions,
  generateSessionTitle,
  type Session,
} from "@/api/sessions";
import { fetchMessages as fetchChatMessages } from "@/api/chat";
import { getFirstUserText } from "./utils";

const PAGE_SIZE = 40;

const SESSION_STORAGE_KEY = "openexcel:sessionId";

function loadStoredSessionId(): number | null {
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    return stored !== null ? Number(stored) : null;
  } catch {
    return null;
  }
}

function saveSessionId(id: number | null) {
  try {
    if (id != null) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, String(id));
    } else {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

type UndoState = "idle" | "loading" | "success" | "error";

export function useSessionWorkspace(
  workspaceId: number | null,
  onUndoComplete?: () => Promise<void> | void,
  initial?: { sessions: Session[]; messages?: unknown[]; messageTotal?: number },
) {
  const [sessions, setSessions] = useState<Session[]>(initial?.sessions ?? []);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(() => {
    const stored = loadStoredSessionId();
    if (initial && stored !== null && initial.sessions.some((s) => s.id === stored)) {
      return stored;
    }
    if (initial && initial.sessions.length > 0) return initial.sessions[0].id;
    return stored;
  });
  const [messages, setMessages] = useState<any[]>(initial?.messages ?? []);
  const [messageTotal, setMessageTotal] = useState(initial?.messageTotal ?? 0);
  const [initialLoaded, setInitialLoaded] = useState(!!initial);
  const [loadingMore, setLoadingMore] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [draftPendingText, setDraftPendingText] = useState<string | null>(null);
  const loadedOffsetRef = useRef(initial?.messages?.length ?? 0);
  const messagesSeededRef = useRef(!!initial?.messages);

  useEffect(() => {
    if (!initial) return;
    messagesSeededRef.current = !!initial.messages;
    setSessions(initial.sessions);
    const stored = loadStoredSessionId();
    const targetId = stored !== null && initial.sessions.some((s) => s.id === stored)
      ? stored
      : initial.sessions[0]?.id ?? null;
    setCurrentSessionId(targetId);
    if (initial.messages) {
      setMessages(initial.messages);
      setMessageTotal(initial.messageTotal ?? initial.messages.length);
      loadedOffsetRef.current = initial.messages.length;
    }
    setInitialLoaded(true);
  }, [initial]);

  useEffect(() => {
    if (workspaceId != null) return;
    setSessions([]);
    setCurrentSessionId(null);
    setMessages([]);
    setMessageTotal(0);
    loadedOffsetRef.current = 0;
    setInitialLoaded(true);
  }, [workspaceId]);

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
    if (messagesSeededRef.current) {
      messagesSeededRef.current = false;
      return;
    }

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
      } catch {
        // Expected: session invalidated by workspace switch
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
    saveSessionId(currentSessionId);
  }, [currentSessionId]);

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

  const handleUndoComplete = useCallback(async () => {
    await onUndoComplete?.();
  }, [onUndoComplete]);

  return {
    sessions,
    currentSessionId,
    messages,
    messageTotal,
    initialLoaded,
    loadingMore,
    historyOpen,
    setHistoryOpen,
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
    handleUndoComplete,
  };
}
