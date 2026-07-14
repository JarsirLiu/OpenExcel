import { useCallback, useEffect, useRef, useState } from "react";
import { deleteSession, fetchSessions, type Session } from "@/api/sessions";

export function useSessionsList(workspaceId: number | null, initialSessions?: Session[]) {
  const [sessions, setSessions] = useState<Session[]>(initialSessions ?? []);
  // A project opens on a new in-memory conversation. Persisted sessions are
  // history entries and become active only after an explicit user selection.
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const previousWorkspaceIdRef = useRef<number | null>(workspaceId);
  const requestGenerationRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const workspaceReady = previousWorkspaceIdRef.current === workspaceId;

  useEffect(() => {
    if (previousWorkspaceIdRef.current === workspaceId) return;
    previousWorkspaceIdRef.current = workspaceId;
    requestGenerationRef.current += 1;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    setSessions([]);
    setCurrentSessionId(null);
    setHistoryOpen(false);
  }, [workspaceId]);

  useEffect(() => {
    return () => {
      requestGenerationRef.current += 1;
      requestControllerRef.current?.abort();
    };
  }, []);

  const refreshSessions = useCallback(
    async (options?: { resetCurrent?: boolean; preserveCurrent?: boolean }) => {
      if (workspaceId == null) {
        setSessions([]);
        setCurrentSessionId(null);
        return [];
      }

      requestGenerationRef.current += 1;
      const generation = requestGenerationRef.current;
      requestControllerRef.current?.abort();
      const controller = new AbortController();
      requestControllerRef.current = controller;

      try {
        const list = await fetchSessions(workspaceId, { signal: controller.signal });
        if (generation !== requestGenerationRef.current || controller.signal.aborted) return [];

        setSessions(list);
        if (options?.resetCurrent) {
          setCurrentSessionId(null);
        } else if (!options?.preserveCurrent) {
          setCurrentSessionId((prev) => {
            if (prev !== null && list.some((session) => session.id === prev)) {
              return prev;
            }
            return list[0]?.id ?? null;
          });
        }
        return list;
      } catch (error) {
        if (!controller.signal.aborted) throw error;
        return [];
      }
    },
    [workspaceId],
  );

  useEffect(() => {
    if (!sessions.some((session) => session.titleStatus === "pending")) return;

    const timer = window.setInterval(() => {
      void refreshSessions({ preserveCurrent: true });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [refreshSessions, sessions]);

  const handleNewSession = useCallback(() => {
    setCurrentSessionId(null);
    setHistoryOpen(false);
    void refreshSessions({ resetCurrent: true });
  }, [refreshSessions]);

  const handleSelectSession = useCallback(
    (id: number) => {
      setCurrentSessionId(id);
      setHistoryOpen(false);
      void refreshSessions();
    },
    [refreshSessions],
  );

  const handleDeleteSession = useCallback(
    async (id: number) => {
      if (workspaceId == null) return;
      const wasCurrent = currentSessionId === id;
      await deleteSession(workspaceId, id);
      await refreshSessions();
      if (wasCurrent) {
        setCurrentSessionId(null);
      }
    },
    [refreshSessions, workspaceId, currentSessionId],
  );

  const visibleSessions = workspaceReady ? sessions : [];
  const visibleCurrentSessionId =
    workspaceReady &&
    currentSessionId != null &&
    sessions.some((session) => session.id === currentSessionId)
      ? currentSessionId
      : null;

  return {
    sessions: visibleSessions,
    setSessions,
    currentSessionId: visibleCurrentSessionId,
    setCurrentSessionId,
    historyOpen,
    setHistoryOpen,
    refreshSessions,
    handleNewSession,
    handleSelectSession,
    handleDeleteSession,
  };
}
