import { useCallback, useEffect, useState } from "react";
import { createSession, deleteSession, fetchSessions, type Session } from "@/api/sessions";

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

export function useSessionsList(workspaceId: number | null, initialSessions?: Session[]) {
  const [sessions, setSessions] = useState<Session[]>(initialSessions ?? []);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(() => {
    const stored = loadStoredSessionId();
    if (initialSessions && stored !== null && initialSessions.some((s) => s.id === stored)) {
      return stored;
    }
    if (initialSessions && initialSessions.length > 0) return initialSessions[0].id;
    return stored;
  });
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    saveSessionId(currentSessionId);
  }, [currentSessionId]);

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

  return {
    sessions,
    setSessions,
    currentSessionId,
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
