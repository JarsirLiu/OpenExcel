import { useCallback, useEffect, useRef } from "react";
import type { Session } from "@/api/sessions";
import { useSessionsList } from "./useSessionsList";

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
    handleNewSession: listNewSession,
    handleSelectSession: listSelectSession,
    handleDeleteSession: listDeleteSession,
  } = useSessionsList(workspaceId, initial?.sessions);
  const initialSeededRef = useRef(false);
  const currentSessionIdRef = useRef(currentSessionId);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  // Seed initial sessions from route loader
  useEffect(() => {
    if (!initial || initialSeededRef.current) return;
    initialSeededRef.current = true;
    setSessions(initial.sessions);
  }, [initial, setSessions]);

  // Reset on workspace switch
  const prevWorkspaceIdRef = useRef(workspaceId);

  useEffect(() => {
    if (workspaceId == null) {
      // Workspace unmounted — no-op, sessions will reset on next mount
    } else if (prevWorkspaceIdRef.current != null && prevWorkspaceIdRef.current !== workspaceId) {
      refreshSessions({ resetCurrent: true });
    }
    prevWorkspaceIdRef.current = workspaceId;
  }, [workspaceId, refreshSessions]);

  const handleDraftSessionCreated = useCallback(
    async (sessionId: number) => {
      const shouldActivate = currentSessionIdRef.current == null;
      const list = await refreshSessions({ resetCurrent: shouldActivate });
      if (shouldActivate && list.some((session) => session.id === sessionId)) {
        setCurrentSessionId(sessionId);
      }
    },
    [refreshSessions, setCurrentSessionId],
  );

  const handleNewSession = useCallback(() => {
    listNewSession();
  }, [listNewSession]);

  const handleSelectSession = useCallback(
    (id: number) => {
      listSelectSession(id);
    },
    [listSelectSession],
  );

  const handleDeleteSession = useCallback(
    async (id: number) => {
      await listDeleteSession(id);
    },
    [listDeleteSession],
  );

  const handleRunComplete = useCallback(
    async (_sessionId: number, _finishedMessages: any[]) => {
      try {
        await refreshSessions();
      } catch (error) {
        console.error("[session] Failed to refresh sessions after chat completion:", error);
      }
    },
    [refreshSessions],
  );

  const handleUndoComplete = useCallback(async () => {
    await onUndoComplete?.();
  }, [onUndoComplete]);

  return {
    sessions,
    currentSessionId,
    historyOpen,
    setHistoryOpen,
    refreshSessions,
    handleDraftSessionCreated,
    handleRunComplete,
    handleNewSession,
    handleSelectSession,
    handleDeleteSession,
    handleUndoComplete,
  };
}
