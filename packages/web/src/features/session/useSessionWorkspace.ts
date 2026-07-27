import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSession as createSessionRequest,
  generateSessionTitle,
  type Session,
} from "@/api/sessions";
import { useSessionsList } from "./useSessionsList";

export function useSessionWorkspace(
  workspaceId: number | null,
  onUndoComplete?: () => Promise<void> | void,
  initial?: { sessions: Session[] },
) {
  const {
    sessions,
    setSessions,
    currentSessionId,
    setCurrentSessionId,
    historyOpen,
    setHistoryOpen,
    refreshSessions,
    handleSelectSession: listSelectSession,
    handleDeleteSession: listDeleteSession,
  } = useSessionsList(workspaceId, initial?.sessions);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [sessionError, setSessionError] = useState<Error | undefined>();
  const initialSeededRef = useRef(false);
  const titleRequestedSessionIdsRef = useRef<Set<number>>(new Set());
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
      setSessionError(undefined);
      titleRequestedSessionIdsRef.current.clear();
      refreshSessions({ resetCurrent: true });
    }
    prevWorkspaceIdRef.current = workspaceId;
  }, [workspaceId, refreshSessions]);

  const createSession = useCallback(async () => {
    if (workspaceId == null) throw new Error("当前工作区不可用");
    const session = await createSessionRequest(workspaceId);
    setSessions((current) => [session, ...current.filter((item) => item.id !== session.id)]);
    return session;
  }, [setSessions, workspaceId]);

  const activateSession = useCallback(
    (sessionId: number) => {
      setCurrentSessionId(sessionId);
      setHistoryOpen(false);
    },
    [setCurrentSessionId, setHistoryOpen],
  );

  const handleNewSession = useCallback(() => {
    if (isCreatingSession) return;

    setIsCreatingSession(true);
    setSessionError(undefined);
    void createSession()
      .then((session) => {
        activateSession(session.id);
      })
      .catch((error) => {
        setSessionError(error instanceof Error ? error : new Error(String(error)));
      })
      .finally(() => {
        setIsCreatingSession(false);
      });
  }, [activateSession, createSession, isCreatingSession]);

  const handleSelectSession = useCallback(
    (id: number) => {
      setSessionError(undefined);
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

  const handleUndoComplete = useCallback(async () => {
    await refreshSessions({ mode: "authoritative" });
    await onUndoComplete?.();
  }, [onUndoComplete, refreshSessions]);

  const handleUserTurnAccepted = useCallback(
    (sessionId: number) => {
      if (workspaceId == null || titleRequestedSessionIdsRef.current.has(sessionId)) return;
      titleRequestedSessionIdsRef.current.add(sessionId);
      void generateSessionTitle(workspaceId, sessionId)
        .then(({ title }) => {
          setSessions((current) =>
            current.map((session) =>
              session.id === sessionId
                ? { ...session, name: title, titleStatus: "generated" as const }
                : session,
            ),
          );
        })
        .catch((error) => {
          titleRequestedSessionIdsRef.current.delete(sessionId);
          console.error("[session] Failed to generate session title:", error);
        });
    },
    [setSessions, workspaceId],
  );

  return {
    sessions,
    currentSessionId,
    historyOpen,
    setHistoryOpen,
    refreshSessions,
    createSession,
    activateSession,
    handleNewSession,
    handleSelectSession,
    handleDeleteSession,
    handleUndoComplete,
    handleUserTurnAccepted,
    isCreatingSession,
    sessionError,
  };
}
