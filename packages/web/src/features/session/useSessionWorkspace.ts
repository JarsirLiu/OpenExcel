import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSession,
  generateSessionTitle,
  type Session,
} from "@/api/sessions";
import { fetchMessages as fetchChatMessages } from "@/api/chat";
import { getFirstUserText } from "./utils";
import { useSessionsList } from "./useSessionsList";

const PAGE_SIZE = 40;

export function useSessionWorkspace(
  workspaceId: number | null,
  onUndoComplete?: () => Promise<void> | void,
  initial?: { sessions: Session[]; messages?: unknown[]; messageTotal?: number },
) {
  const {
    sessions,
    setSessions,
    currentSessionId,
    setCurrentSessionId,
    historyOpen,
    setHistoryOpen,
    refreshSessions,
    ensureSession,
    handleNewSession: listNewSession,
    handleSelectSession: listSelectSession,
    handleDeleteSession: listDeleteSession,
  } = useSessionsList(workspaceId, initial?.sessions);

  const [messages, setMessages] = useState<any[]>(initial?.messages ?? []);
  const [messageTotal, setMessageTotal] = useState(initial?.messageTotal ?? 0);
  const [initialLoaded, setInitialLoaded] = useState(!!initial);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const loadedOffsetRef = useRef(initial?.messages?.length ?? 0);
  const messagesSeededRef = useRef(!!initial?.messages);
  const draftSessionIdsRef = useRef<Set<number>>(new Set());

  // Seed initial data from route loader
  useEffect(() => {
    if (!initial) return;
    messagesSeededRef.current = !!initial.messages;
    setSessions(initial.sessions);
    if (initial.messages) {
      setMessages(initial.messages);
      setMessageTotal(initial.messageTotal ?? initial.messages.length);
      loadedOffsetRef.current = initial.messages.length;
    }
    setInitialLoaded(true);
  }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset on workspace switch
  const prevWorkspaceIdRef = useRef(workspaceId);

  useEffect(() => {
    if (workspaceId == null) {
      setMessages([]);
      setMessageTotal(0);
      loadedOffsetRef.current = 0;
      setInitialLoaded(true);
    } else if (prevWorkspaceIdRef.current != null && prevWorkspaceIdRef.current !== workspaceId) {
      setMessages([]);
      setMessageTotal(0);
      loadedOffsetRef.current = 0;
      setInitialLoaded(false);
      refreshSessions();
    }
    prevWorkspaceIdRef.current = workspaceId;
  }, [workspaceId, refreshSessions]);

  // Load messages when switching to an existing session
  useEffect(() => {
    if (messagesSeededRef.current) {
      messagesSeededRef.current = false;
      return;
    }

    if (currentSessionId != null && draftSessionIdsRef.current.has(currentSessionId)) {
      draftSessionIdsRef.current.delete(currentSessionId);
      setMessages([]);
      setMessageTotal(0);
      loadedOffsetRef.current = 0;
      setInitialLoaded(true);
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

  const handleSendInDraft = useCallback(async (text: string) => {
    if (workspaceId == null) throw new Error("No workspace");
    const session = await createSession(workspaceId);
    draftSessionIdsRef.current.add(session.id);
    setCurrentSessionId(session.id);
    setSessions((prev) => [session, ...prev]);
    return session.id;
  }, [workspaceId, setCurrentSessionId, setSessions]);

  const handleNewSession = useCallback(() => {
    setMessages([]);
    setMessageTotal(0);
    loadedOffsetRef.current = 0;
    setInitialLoaded(true);
    listNewSession();
  }, [listNewSession]);

  const handleSelectSession = useCallback((id: number) => {
    listSelectSession(id);
  }, [listSelectSession]);

  const handleDeleteSession = useCallback(async (id: number) => {
    await listDeleteSession(id);
  }, [listDeleteSession]);

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
    handleRunComplete,
    handleNewSession,
    handleSelectSession,
    handleDeleteSession,
    handleUndoComplete,
  };
}