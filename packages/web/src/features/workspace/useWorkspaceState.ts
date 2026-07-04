import { useEffect, useMemo, useState } from "react";
import { fetchWorkspaces, type Workspace } from "../../api/workspaces";

export function useWorkspaceState() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void fetchWorkspaces()
      .then((list) => {
        if (cancelled) return;
        setWorkspaces(list);
        setActiveWorkspaceId((prev) => {
          if (prev != null && list.some((workspace) => workspace.id === prev)) {
            return prev;
          }
          return list[0]?.id ?? null;
        });
      })
      .catch(() => {
        if (cancelled) return;
        setWorkspaces([]);
        setActiveWorkspaceId(null);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
  };
}
