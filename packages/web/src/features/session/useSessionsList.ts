import { useCallback, useEffect, useRef, useState } from "react";
import { createSession, deleteSession, fetchSessions, type Session } from "@/api/sessions";

const SESSION_STORAGE_KEY = "openexcel:sessionId";

function getSessionStorageKey(workspaceId: number | null): string | null {
  return workspaceId == null ? null : `${SESSION_STORAGE_KEY}:${workspaceId}`;
}

function loadStoredSessionId(workspaceId: number | null): number | null {
  const key = getSessionStorageKey(workspaceId);
  if (!key) return null;
  try {
    const stored = sessionStorage.getItem(key);
    return stored !== null ? Number(stored) : null;
  } catch {
    return null;
  }
}

function saveSessionId(workspaceId: number | null, id: number | null) {
  const key = getSessionStorageKey(workspaceId);
  if (!key) return;
  try {
    if (id != null) {
      sessionStorage.setItem(key, String(id));
    } else {
      sessionStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

export function useSessionsList(workspaceId: number | null, initialSessions?: Session[]) {
  const [sessions, setSessions] = useState<Session[]>(initialSessions ?? []);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(() => {
    const stored = loadStoredSessionId(workspaceId);
    if (initialSessions && stored !== null && initialSessions.some((s) => s.id === stored)) {
      return stored;
    }
    if (initialSessions && initialSessions.length > 0) return initialSessions[0].id;
    return stored;
  });
  const previousWorkspaceIdRef = useRef<number | null>(workspaceId);
  const requestGenerationRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const workspaceReady = previousWorkspaceIdRef.current === workspaceId;

  useEffect(() => {
    if (workspaceReady) {
      saveSessionId(workspaceId, currentSessionId);
    }
  }, [currentSessionId, workspaceId, workspaceReady]);

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

  const refreshSessions = useCallback(async () => {
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
      setCurrentSessionId((prev) => {
        if (prev !== null && list.some((session) => session.id === prev)) {
          return prev;
        }
        return list[0]?.id ?? null;
      });
      return list;
    } catch (error) {
      if (!controller.signal.aborted) throw error;
      return [];
    }
  }, [workspaceId]);

  const ensureSession = useCallback(async () => {
    if (currentSessionId != null) return currentSessionId;
    if (workspaceId == null) throw new Error("No workspace");
    const session = await createSession(workspaceId);
    setCurrentSessionId(session.id);
    setSessions((prev) => [session, ...prev]);
    return session.id;
  }, [currentSessionId, workspaceId]);

  const handleNewSession = useCallback(() => {
    setCurrentSessionId(null);
    setHistoryOpen(false);
  }, []);

  const handleSelectSession = useCallback((id: number) => {
    setCurrentSessionId(id);
    setHistoryOpen(false);
  }, []);

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
    ensureSession,
    handleNewSession,
    handleSelectSession,
    handleDeleteSession,
  };
}
