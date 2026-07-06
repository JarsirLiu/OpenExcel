import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchWorkspaces, type Workspace } from "@/api/workspaces";

export function useWorkspaceState() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const cancelledRef = useRef(false);

  const load = useCallback(async () => {
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
    cancelledRef.current = false;
    void load();
    return () => {
      cancelledRef.current = true;
    };
  }, [load]);

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
