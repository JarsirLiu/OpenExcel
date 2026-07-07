import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWorkspaces, type Workspace } from "@/api/workspaces";

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

export function useWorkspaceState(initialWorkspaces?: Workspace[]) {
  const [workspaces, setWorkspaces] = useState(initialWorkspaces ?? []);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<number | null>(() => {
    const stored = loadStoredWorkspaceId();
    if (initialWorkspaces && stored !== null && initialWorkspaces.some((w) => w.id === stored))
      return stored;
    return initialWorkspaces?.[0]?.id ?? stored ?? null;
  });
  const [loading, setLoading] = useState(!initialWorkspaces);

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
    setLoading(false);
  }, []);

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
  };
}