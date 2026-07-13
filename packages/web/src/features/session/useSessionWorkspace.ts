import { useCallback, useEffect, useRef } from "react";
import { createSession, generateSessionTitle, type Session } from "@/api/sessions";
import { getFirstUserText } from "@/features/shared/messageUtils";
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
    ensureSession,
    handleNewSession: listNewSession,
    handleSelectSession: listSelectSession,
    handleDeleteSession: listDeleteSession,
  } = useSessionsList(workspaceId, initial?.sessions);
  const initialSeededRef = useRef(false);

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
      refreshSessions();
    }
    prevWorkspaceIdRef.current = workspaceId;
  }, [workspaceId, refreshSessions]);

  const handleSendInDraft = useCallback(
    async (_text: string) => {
      if (workspaceId == null) throw new Error("No workspace");
      const session = await createSession(workspaceId);
      setCurrentSessionId(session.id);
      setSessions((prev) => [session, ...prev]);
      return session.id;
    },
    [workspaceId, setCurrentSessionId, setSessions],
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
    async (sessionId: number, finishedMessages: any[]) => {
      const firstUserText = getFirstUserText(finishedMessages).trim();
      try {
        if (firstUserText && workspaceId != null) {
          await generateSessionTitle(workspaceId, sessionId, firstUserText);
        }
      } catch (error) {
        console.error("[session] Failed to generate session title:", error);
      }

      try {
        await refreshSessions();
      } catch (error) {
        console.error("[session] Failed to refresh sessions after title update:", error);
      }
    },
    [refreshSessions, workspaceId],
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
    ensureSession,
    handleSendInDraft,
    handleRunComplete,
    handleNewSession,
    handleSelectSession,
    handleDeleteSession,
    handleUndoComplete,
  };
}
