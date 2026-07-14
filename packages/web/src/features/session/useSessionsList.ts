import { useCallback, useEffect, useRef, useState } from "react";
import { deleteSession, fetchSessions, type Session } from "@/api/sessions";
import { usePendingSessionTitleRefresh } from "./usePendingSessionTitleRefresh";

type RefreshMode = "background" | "authoritative";

type RefreshOptions = {
  mode?: RefreshMode;
  resetCurrent?: boolean;
  preserveCurrent?: boolean;
};

type ActiveRefresh = {
  controller: AbortController;
  epoch: number;
  id: number;
  promise: Promise<RefreshResult>;
};

type RefreshResult = { list: Session[] } | { cancelled: true };

export function useSessionsList(workspaceId: number | null, initialSessions?: Session[]) {
  const [sessions, setSessions] = useState<Session[]>(initialSessions ?? []);
  // A project opens on a new in-memory conversation. Persisted sessions are
  // history entries and become active only after an explicit user selection.
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const previousWorkspaceIdRef = useRef<number | null>(workspaceId);
  const requestGenerationRef = useRef(0);
  const refreshEpochRef = useRef(0);
  const refreshIdRef = useRef(0);
  const activeRefreshRef = useRef<ActiveRefresh | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const workspaceReady = previousWorkspaceIdRef.current === workspaceId;

  useEffect(() => {
    if (previousWorkspaceIdRef.current === workspaceId) return;
    previousWorkspaceIdRef.current = workspaceId;
    requestGenerationRef.current += 1;
    activeRefreshRef.current?.controller.abort();
    activeRefreshRef.current = null;
    setSessions([]);
    setCurrentSessionId(null);
    setHistoryOpen(false);
  }, [workspaceId]);

  useEffect(() => {
    return () => {
      requestGenerationRef.current += 1;
      activeRefreshRef.current?.controller.abort();
      activeRefreshRef.current = null;
    };
  }, []);

  const refreshSessions = useCallback(
    async (options?: RefreshOptions) => {
      if (workspaceId == null) {
        setSessions([]);
        setCurrentSessionId(null);
        return [];
      }

      const generation = requestGenerationRef.current;
      const mode = options?.mode ?? "background";
      // A read after a create/delete must start after that mutation. Background
      // polling may join any current request, but authoritative reads replace it.
      let requiredEpoch = refreshEpochRef.current;
      if (mode === "authoritative") {
        refreshEpochRef.current += 1;
        requiredEpoch = refreshEpochRef.current;
      }

      while (true) {
        if (generation !== requestGenerationRef.current) return [];
        requiredEpoch = Math.max(requiredEpoch, refreshEpochRef.current);

        let activeRefresh = activeRefreshRef.current;
        if (!activeRefresh || activeRefresh.epoch < requiredEpoch) {
          activeRefresh?.controller.abort();

          const controller = new AbortController();
          const id = refreshIdRef.current + 1;
          refreshIdRef.current = id;
          const promise: Promise<RefreshResult> = fetchSessions(workspaceId, {
            signal: controller.signal,
          })
            .then<RefreshResult>((result) => {
              if (
                generation !== requestGenerationRef.current ||
                controller.signal.aborted ||
                activeRefreshRef.current?.id !== id
              ) {
                return { cancelled: true } as const;
              }
              return { list: result } as const;
            })
            .catch((error): RefreshResult => {
              if (controller.signal.aborted || activeRefreshRef.current?.id !== id) {
                return { cancelled: true } as const;
              }
              throw error;
            })
            .finally(() => {
              if (activeRefreshRef.current?.id === id) {
                activeRefreshRef.current = null;
              }
            });
          activeRefresh = { controller, epoch: requiredEpoch, id, promise };
          activeRefreshRef.current = activeRefresh;
        }

        if (!activeRefresh) continue;
        const result = await activeRefresh.promise;
        if ("list" in result) {
          if (generation !== requestGenerationRef.current) return [];

          const list = result.list;
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
        }

        // A background request was superseded by a newer authoritative read.
        // It must not issue another request or overwrite that newer result.
        if (mode === "background") return [];
      }
    },
    [workspaceId],
  );

  usePendingSessionTitleRefresh({
    hasPendingTitle: sessions.some((session) => session.titleStatus === "pending"),
    refreshSessions: (options) => refreshSessions({ ...options, mode: "background" }),
  });

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
      await refreshSessions({ mode: "authoritative" });
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
