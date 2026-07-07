import { useCallback, useRef, useState, useMemo } from "react";
import { t } from "@/lib/i18n";
import { createWorkspace, deleteWorkspace, renameWorkspace } from "@/api/workspaces";
import type { Workspace } from "@/api/workspaces";
import type { WorkbookMeta } from "@/api/workbooks";
import styles from "./WorkspaceSidebar.module.css";

const MIN_WIDTH = 210;
const DEFAULT_WIDTH = 220;
const COLLAPSED_WIDTH = 32;

type Props = {
  activeWorkspaceId: number | null;
  onActiveWorkspaceChange: (id: number) => void;
  workspaces: Workspace[];
  onRefresh: () => void;
  workbooksMap: Map<number, WorkbookMeta[]>;
  activeWorkbookId: number | null;
  onWorkbookSelect: (workspaceId: number, workbookId: number) => void;
  onWorkbookDelete: (workbookId: number) => Promise<void>;
  onWorkbookCreate: (workspaceId: number) => Promise<void>;
};

export function WorkspaceSidebar({
  activeWorkspaceId,
  onActiveWorkspaceChange,
  workspaces,
  onRefresh,
  workbooksMap,
  activeWorkbookId,
  onWorkbookSelect,
  onWorkbookDelete,
  onWorkbookCreate,
}: Props) {
  const [collapsed, setCollapsed] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingWbId, setDeletingWbId] = useState<number | null>(null);
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<number>>(new Set());
  const rafRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // No auto-expand — user controls expand/collapse manually.
  const expandedSet = expandedWorkspaces;

  const toggleExpand = useCallback((id: number) => {
    const next = new Set(expandedWorkspaces);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedWorkspaces(next);
  }, [expandedWorkspaces]);

  const handleCreate = useCallback(async () => {
    try {
      const ws = await createWorkspace(t("new_project", "新项目"));
      onActiveWorkspaceChange(ws.id);
      void onRefresh();
    } catch (e) {
      console.error("创建项目失败:", e);
    }
  }, [onActiveWorkspaceChange, onRefresh]);

  const handleSelect = useCallback(
    (id: number) => {
      if (editingId !== null) return;
      onActiveWorkspaceChange(id);
    },
    [onActiveWorkspaceChange, editingId],
  );

  const handleStartEdit = useCallback((e: React.MouseEvent, ws: { id: number; name: string }) => {
    e.stopPropagation();
    setEditingId(ws.id);
    setEditValue(ws.name);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    const id = editingId;
    if (id == null) return;
    const trimmed = editValue.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    try {
      await renameWorkspace(id, trimmed);
      setEditingId(null);
      void onRefresh();
    } catch (e) {
      console.error("修改项目名称失败:", e);
    }
  }, [editingId, editValue, onRefresh]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void handleSaveEdit();
      } else if (e.key === "Escape") {
        handleCancelEdit();
      }
    },
    [handleSaveEdit, handleCancelEdit],
  );

  const handleDelete = useCallback(
    async (e: React.MouseEvent, id: number) => {
      e.stopPropagation();
      setDeletingId(id);
    },
    [],
  );

  const handleConfirmDelete = useCallback(
    async (e: React.MouseEvent, id: number) => {
      e.stopPropagation();
      try {
        await deleteWorkspace(id);
        setDeletingId(null);
        if (id === activeWorkspaceId) {
          const remaining = workspaces.filter((ws) => ws.id !== id);
          if (remaining.length > 0) {
            onActiveWorkspaceChange(remaining[0].id);
          }
        }
        void onRefresh();
      } catch (e) {
        console.error("删除项目失败:", e);
        setDeletingId(null);
      }
    },
    [activeWorkspaceId, onActiveWorkspaceChange, onRefresh, workspaces],
  );

  const handleCancelDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(null);
  }, []);

  const handleWorkbookDeleteClick = useCallback((e: React.MouseEvent, wbId: number) => {
    e.stopPropagation();
    setDeletingWbId(wbId);
  }, []);

  const handleConfirmWbDelete = useCallback(
    async (e: React.MouseEvent, wbId: number) => {
      e.stopPropagation();
      try {
        await onWorkbookDelete(wbId);
        setDeletingWbId(null);
      } catch (e) {
        console.error("删除工作簿失败:", e);
        setDeletingWbId(null);
      }
    },
    [onWorkbookDelete],
  );

  const handleCancelWbDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingWbId(null);
  }, []);

  const handleCreateWorkbook = useCallback(
    (e: React.MouseEvent, workspaceId: number) => {
      e.stopPropagation();
      void onWorkbookCreate(workspaceId);
    },
    [onWorkbookCreate],
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
          <span className={styles.serif}>{t("workspaces", "工作区")}</span>
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
          {workspaces.map((ws) => {
            const workbooks = workbooksMap.get(ws.id) ?? [];
            const isExpanded = expandedSet.has(ws.id);
            const isActive = ws.id === activeWorkspaceId;

            return (
              <div key={ws.id}>
                <div
                  className={`${styles.item} ${isActive ? styles.itemActive : ""}`}
                  onClick={() => handleSelect(ws.id)}
                >
                  <span className={styles.itemIcon}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M4 5h8M4 8h8M4 11h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </span>
                  {deletingId === ws.id ? (
                    <span className={styles.deleteConfirm}>
                      <span>确认删除?</span>
                      <button onClick={(e) => void handleConfirmDelete(e, ws.id)}>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M2.5 7.5l3 3 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <button onClick={handleCancelDelete}>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    </span>
                  ) : editingId === ws.id ? (
                    <input
                      ref={inputRef}
                      className={styles.editInput}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => void handleSaveEdit()}
                      onKeyDown={handleKeyDown}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <>
                      <span className={styles.itemName}>{ws.name}</span>
                      {workbooks.length > 0 && (
                        <span
                          className={`${styles.chevron} ${isExpanded ? styles.chevronExpanded : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(ws.id);
                          }}
                        >
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 3l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      )}
                      <span className={styles.itemActions}>
                        <button className={styles.editBtn} onClick={(e) => handleStartEdit(e, ws)} title="重命名">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M8.5 1.5l2 2L4 10H2V8l6.5-6.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <button className={styles.deleteBtn} onClick={(e) => handleDelete(e, ws.id)} title="删除">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2 3h8M4.5 3V2a1 1 0 011-1h1a1 1 0 011 1v1M9.5 3v7a1 1 0 01-1 1h-5a1 1 0 01-1-1V3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M5 5.5v3M7 5.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                          </svg>
                        </button>
                      </span>
                    </>
                  )}
                </div>
                {isExpanded && workbooks.length > 0 && (
                  <div className={styles.workbookList}>
                    {workbooks.map((wb) => {
                      const wbActive = wb.id === activeWorkbookId && ws.id === activeWorkspaceId;
                      return (
                        <div
                          key={wb.id}
                          className={`${styles.workbookItem} ${wbActive ? styles.workbookActive : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onWorkbookSelect(ws.id, wb.id);
                          }}
                        >
                          <span className={styles.workbookIcon}>
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                              <rect x="1.5" y="2" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                              <path d="M4 5h6M4 7h6M4 9h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                            </svg>
                          </span>
                          {deletingWbId === wb.id ? (
                            <span className={styles.deleteConfirm}>
                              <span>确认删除?</span>
                              <button onClick={(e) => void handleConfirmWbDelete(e, wb.id)}>
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                  <path d="M2.5 7.5l3 3 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                              <button onClick={handleCancelWbDelete}>
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                  <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                </svg>
                              </button>
                            </span>
                          ) : (
                            <>
                              <span className={styles.workbookName}>{wb.name}</span>
                              <span className={styles.workbookActions}>
                                <button
                                  className={styles.workbookDeleteBtn}
                                  onClick={(e) => handleWorkbookDeleteClick(e, wb.id)}
                                  title="删除"
                                >
                                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                                    <path d="M2 2.5h7M4 2.5V1.5a1 1 0 011-1h1a1 1 0 011 1v1M8.5 2.5v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                                    <path d="M4.5 4v4M6.5 4v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                                  </svg>
                                </button>
                              </span>
                            </>
                          )}
                        </div>
                      );
                    })}
                    <button
                      className={styles.workbookCreateBtn}
                      onClick={(e) => handleCreateWorkbook(e, ws.id)}
                      title="新建工作簿"
                    >
                      <span className={styles.plusIcon}>
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                          <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </span>
                      新建工作簿
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button className={`${styles.createBtn} ${styles.serif}`} onClick={handleCreate}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {t("new_workspace", "新建项目")}
        </button>
      </div>
      <div className={styles.resizeHandle} onMouseDown={handleResizeMouseDown} />
    </div>
  );
}