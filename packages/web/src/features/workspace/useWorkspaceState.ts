import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
    // sessionStorage may be unavailable
  }
}

export function useWorkspaceState(initialWorkspaces?: Workspace[]) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(initialWorkspaces ?? []);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<number | null>(loadStoredWorkspaceId);
  const [loading, setLoading] = useState(!initialWorkspaces);
  const cancelledRef = useRef(false);
  const seededRef = useRef(false);

  useEffect(() => {
    if (!initialWorkspaces || seededRef.current) return;
    seededRef.current = true;
    setActiveWorkspaceId((prev) => {
      if (prev != null && initialWorkspaces.some((w) => w.id === prev)) {
        return prev;
      }
      return initialWorkspaces[0]?.id ?? null;
    });
    setLoading(false);
  }, [initialWorkspaces]);

  const load = useCallback(async () => {
    if (seededRef.current) return;
    setLoading(true);
    try {
      const list = await fetchWorkspaces();
      if (cancelledRef.current) return;
      setWorkspaces(list);
      setActiveWorkspaceId((prev) => {
        if (prev != null && list.some((workspace) => workspace.id === prev)) {
          return prev;
        }
        return list[0]?.id ?? null;
      });
    } catch {
      if (cancelledRef.current) return;
      setWorkspaces([]);
      setActiveWorkspaceId(null);
    } finally {
      if (!cancelledRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (seededRef.current) return;
    cancelledRef.current = false;
    void load();
    return () => {
      cancelledRef.current = true;
    };
  }, [load]);

  useEffect(() => {
    saveWorkspaceId(activeWorkspaceId);
  }, [activeWorkspaceId]);

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null,
    [activeWorkspaceId, workspaces],
  );

  return {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    setActiveWorkspaceId,
    loading,
    refresh: load,
  };
}
