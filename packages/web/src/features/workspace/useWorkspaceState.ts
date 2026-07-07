import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchWorkspaces, type Workspace } from "@/api/workspaces";
import { fetchWorkbooks, type WorkbookMeta } from "@/api/workbooks";

const STORAGE_KEY = "openexcel:activeWorkspaceId";

function loadStoredWorkspaceId(): number | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored !== null ? Number(stored) : null;
  } catch {
    return null;
  }
}

function saveWorkspaceId(id: number | null) {
  try {
    if (id != null) {
      sessionStorage.setItem(STORAGE_KEY, String(id));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
  }
}

function sortWorkbooks(list: WorkbookMeta[]): WorkbookMeta[] {
  return [...list].sort((a, b) => a.order - b.order || a.id - b.id);
}

export function useWorkspaceState(initialWorkspaces?: Workspace[]) {
  const [workspaces, setWorkspaces] = useState(initialWorkspaces ?? []);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<number | null>(() => {
    const stored = loadStoredWorkspaceId();
    if (initialWorkspaces && stored !== null && initialWorkspaces.some((w) => w.id === stored))
      return stored;
    return initialWorkspaces?.[0]?.id ?? stored ?? null;
  });
  const [loading, setLoading] = useState(!initialWorkspaces);
  const [workbooksMap, setWorkbooksMap] = useState<Map<number, WorkbookMeta[]>>(new Map());
  const fetchingRef = useRef<Set<number>>(new Set());

  // Fetch workbooks for all workspaces
  const fetchAllWorkbooks = useCallback(async (wsList: Workspace[]) => {
    const results = await Promise.all(
      wsList.map(async (ws): Promise<readonly [number, WorkbookMeta[]]> => {
        if (fetchingRef.current.has(ws.id)) return [ws.id, []];
        fetchingRef.current.add(ws.id);
        try {
          const list = await fetchWorkbooks(ws.id);
          return [ws.id, sortWorkbooks(list)];
        } catch {
          return [ws.id, []];
        } finally {
          fetchingRef.current.delete(ws.id);
        }
      }),
    );
    setWorkbooksMap(new Map(results));
  }, []);

  useEffect(() => {
    if (workspaces.length === 0) {
      setWorkbooksMap(new Map());
      return;
    }
    fetchAllWorkbooks(workspaces);
  }, [workspaces, fetchAllWorkbooks]);

  useEffect(() => {
    if (initialWorkspaces) {
      setWorkspaces(initialWorkspaces);
      setActiveWorkspaceId((prev) => {
        if (prev != null && initialWorkspaces.some((w) => w.id === prev)) return prev;
        return initialWorkspaces[0]?.id ?? null;
      });
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchWorkspaces().then((list) => {
      if (cancelled) return;
      setWorkspaces(list);
      setActiveWorkspaceId((prev) => {
        if (prev != null && list.some((w) => w.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [initialWorkspaces]);

  useEffect(() => {
    saveWorkspaceId(activeWorkspaceId);
  }, [activeWorkspaceId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const list = await fetchWorkspaces();
    setWorkspaces(list);
    setActiveWorkspaceId((prev) => {
      if (prev != null && list.some((w) => w.id === prev)) return prev;
      return list[0]?.id ?? null;
    });
    await fetchAllWorkbooks(list);
    setLoading(false);
  }, [fetchAllWorkbooks]);

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId) ?? null,
    [activeWorkspaceId, workspaces],
  );

  return {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    setActiveWorkspaceId,
    loading,
    refresh,
    workbooksMap,
    refreshWorkbooks: fetchAllWorkbooks,
  };
}