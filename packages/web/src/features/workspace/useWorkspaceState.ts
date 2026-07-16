import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWorkbooks, type WorkbookMeta } from "@/api/workbooks";
import { fetchWorkspaces, type Workspace } from "@/api/workspaces";
import { sortWorkbooks } from "./workbookOrdering";

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
  } catch {}
}

export function useWorkspaceState(
  initialWorkspaces?: Workspace[],
  selectedWorkspaceId?: number | null,
) {
  const [workspaces, setWorkspaces] = useState(initialWorkspaces ?? []);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<number | null>(() => {
    const stored = loadStoredWorkspaceId();
    if (initialWorkspaces && stored !== null && initialWorkspaces.some((w) => w.id === stored))
      return stored;
    return initialWorkspaces?.[0]?.id ?? stored ?? null;
  });
  const [loading, setLoading] = useState(!initialWorkspaces);
  const [workbooksMap, setWorkbooksMap] = useState<Map<number, WorkbookMeta[]>>(new Map());
  const workbookCatalogRequestRef = useRef(0);

  const fetchAllWorkbooks = useCallback(async (wsList: Workspace[]) => {
    const requestId = ++workbookCatalogRequestRef.current;
    const results = await Promise.all(
      wsList.map(async (ws): Promise<readonly [number, WorkbookMeta[]] | null> => {
        try {
          const list = await fetchWorkbooks(ws.id);
          return [ws.id, sortWorkbooks(list)];
        } catch {
          return null;
        }
      }),
    );
    if (requestId !== workbookCatalogRequestRef.current) return;
    setWorkbooksMap((current) => {
      const next = new Map(current);
      const workspaceIds = new Set(wsList.map((ws) => ws.id));
      for (const workspaceId of next.keys()) {
        if (!workspaceIds.has(workspaceId)) next.delete(workspaceId);
      }
      for (const result of results) {
        if (result) next.set(result[0], result[1]);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (workspaces.length === 0) {
      workbookCatalogRequestRef.current += 1;
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
    if (selectedWorkspaceId == null || !workspaces.some((ws) => ws.id === selectedWorkspaceId)) {
      return;
    }
    setActiveWorkspaceId((currentId) =>
      currentId === selectedWorkspaceId ? currentId : selectedWorkspaceId,
    );
  }, [selectedWorkspaceId, workspaces]);

  useEffect(() => {
    saveWorkspaceId(activeWorkspaceId);
  }, [activeWorkspaceId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchWorkspaces();
      setWorkspaces(list);
      setActiveWorkspaceId((prev) => {
        if (prev != null && list.some((w) => w.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } finally {
      setLoading(false);
    }
  }, [fetchAllWorkbooks]);

  return {
    workspaces,
    activeWorkspaceId,
    loading,
    refresh,
    workbooksMap,
    refreshWorkbooks: fetchAllWorkbooks,
  };
}
