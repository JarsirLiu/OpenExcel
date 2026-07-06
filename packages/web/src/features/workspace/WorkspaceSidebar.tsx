import { useCallback, useRef, useState } from "react";
import { createWorkspace } from "@/api/workspaces";
import { useWorkspaceState } from "./useWorkspaceState";
import styles from "./WorkspaceSidebar.module.css";

const MIN_WIDTH = 160;
const DEFAULT_WIDTH = 220;
const COLLAPSED_WIDTH = 32;

type Props = {
  onActiveWorkspaceChange: (id: number) => void;
};

export function WorkspaceSidebar({ onActiveWorkspaceChange }: Props) {
  const { workspaces, activeWorkspaceId, refresh: refreshWorkspaces } = useWorkspaceState();
  const [collapsed, setCollapsed] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const rafRef = useRef<number | null>(null);

  const handleCreate = useCallback(async () => {
    try {
      const ws = await createWorkspace();
      onActiveWorkspaceChange(ws.id);
      void refreshWorkspaces();
    } catch (e) {
      console.error("创建工作区失败:", e);
    }
  }, [onActiveWorkspaceChange, refreshWorkspaces]);

  const handleSelect = useCallback(
    (id: number) => {
      onActiveWorkspaceChange(id);
    },
    [onActiveWorkspaceChange],
  );

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      const startX = e.clientX;
      const startWidth = sidebarWidth;

      const onMouseMove = (e: MouseEvent) => {
        const newWidth = startWidth + (e.clientX - startX);
        setSidebarWidth(Math.max(MIN_WIDTH, newWidth));
        if (rafRef.current == null) {
          rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            window.dispatchEvent(new Event("resize"));
          });
        }
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setIsResizing(false);
        if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        window.dispatchEvent(new Event("resize"));
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [sidebarWidth],
  );

  const width = collapsed ? COLLAPSED_WIDTH : sidebarWidth;
  const transitionStyle = isResizing ? { transition: "none" as const } : undefined;
  return collapsed ? (
    <div className={`${styles.sidebar} ${styles.collapsed}`} style={{ width: COLLAPSED_WIDTH }}>
      <button className={styles.expandBtn} onClick={() => setCollapsed(false)} title="Expand sidebar">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  ) : (
    <div className={styles.sidebar} style={{ width, ...transitionStyle }}>
      <div className={styles.inner} style={{ width }}>
        <div className={styles.header}>
          <span>Workspaces</span>
          <button
            className={styles.toggleBtn}
            onClick={() => setCollapsed(true)}
            title="Collapse sidebar"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className={styles.list}>
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              className={`${styles.item} ${ws.id === activeWorkspaceId ? styles.itemActive : ""}`}
              onClick={() => handleSelect(ws.id)}
            >
              <span className={styles.itemIcon}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M4 5h8M4 8h8M4 11h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </span>
              {ws.name}
            </button>
          ))}
        </div>

        <button className={styles.createBtn} onClick={handleCreate}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          New Workspace
        </button>
      </div>
      <div className={styles.resizeHandle} onMouseDown={handleResizeMouseDown} />
    </div>
  );
}