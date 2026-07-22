import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkbookMeta } from "@/api/workbooks";
import { downloadWorkbook } from "@/api/workbooks";
import type { Workspace } from "@/api/workspaces";
import { createWorkspace, deleteWorkspace, renameWorkspace } from "@/api/workspaces";
import { t } from "@/lib/i18n";
import { usePanelResize } from "@/shared/hooks/usePanelResize";
import { confirm } from "@/shared/lib";
import styles from "./WorkspaceSidebar.module.css";

const MIN_WIDTH = 210;
const DEFAULT_WIDTH = 246;
const COLLAPSED_WIDTH = 32;
const SIDEBAR_COLLAPSED_KEY = "openexcel:sidebarCollapsed:v2";
const SIDEBAR_WIDTH_KEY = "openexcel:sidebarWidth";

type Props = {
  onNavigateHome: () => void;
  activeWorkspaceId: number | null;
  onWorkspaceSelect: (workspace: Workspace) => void;
  workspaces: Workspace[];
  onRefresh: () => void;
  workbooksMap: Map<number, WorkbookMeta[]>;
  activeWorkbookId: number | null;
  onWorkbookSelect: (workspaceId: number, workbookId: number) => void;
  onWorkbookDelete: (workbookId: number) => Promise<void>;
  onWorkbookCreate: (workspaceId: number) => Promise<void>;
  homeLabel?: string;
  readOnly?: boolean;
  storageNamespace?: string;
};

export function WorkspaceSidebar({
  onNavigateHome,
  activeWorkspaceId,
  onWorkspaceSelect,
  workspaces,
  onRefresh,
  workbooksMap,
  activeWorkbookId,
  onWorkbookSelect,
  onWorkbookDelete,
  onWorkbookCreate,
  homeLabel = "返回首页",
  readOnly = false,
  storageNamespace,
}: Props) {
  const collapsedStorageKey = storageNamespace
    ? `${SIDEBAR_COLLAPSED_KEY}:${storageNamespace}`
    : SIDEBAR_COLLAPSED_KEY;
  const widthStorageKey = storageNamespace
    ? `${SIDEBAR_WIDTH_KEY}:${storageNamespace}`
    : SIDEBAR_WIDTH_KEY;
  const [collapsed, setCollapsed] = useState(() => {
    const stored = sessionStorage.getItem(collapsedStorageKey);
    return stored !== null ? stored === "true" : false;
  });
  const [initialSidebarWidth] = useState(() => {
    const stored = sessionStorage.getItem(widthStorageKey);
    return stored !== null ? Number(stored) : DEFAULT_WIDTH;
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<number>>(
    () => new Set(readOnly && activeWorkspaceId != null ? [activeWorkspaceId] : []),
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sessionStorage.setItem(collapsedStorageKey, String(collapsed));
  }, [collapsed, collapsedStorageKey]);

  const applySidebarWidth = useCallback((width: number) => {
    sidebarRef.current?.style.setProperty("width", `${width}px`);
    innerRef.current?.style.setProperty("width", `${width}px`);
  }, []);
  const notifyWorkbookResize = useCallback(() => {
    window.dispatchEvent(new Event("resize"));
  }, []);
  const {
    width: sidebarWidth,
    isResizing,
    handleMouseDown: handleResizeMouseDown,
  } = usePanelResize({
    initialWidth: initialSidebarWidth,
    minWidth: MIN_WIDTH,
    edge: "right",
    applyWidth: applySidebarWidth,
    onResizeSettled: notifyWorkbookResize,
  });

  useEffect(() => {
    sessionStorage.setItem(widthStorageKey, String(sidebarWidth));
  }, [sidebarWidth, widthStorageKey]);

  const expandedSet = expandedWorkspaces;

  const toggleExpand = useCallback(
    (id: number) => {
      const next = new Set(expandedWorkspaces);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      setExpandedWorkspaces(next);
    },
    [expandedWorkspaces],
  );

  const handleCreate = useCallback(async () => {
    if (readOnly) return;
    try {
      const ws = await createWorkspace(t("new_project", "新项目"));
      onWorkspaceSelect(ws);
    } catch (e) {
      console.error("创建项目失败:", e);
    }
  }, [onWorkspaceSelect, readOnly]);

  const handleSelect = useCallback(
    (workspace: Workspace) => {
      if (editingId !== null) return;
      onWorkspaceSelect(workspace);
    },
    [onWorkspaceSelect, editingId],
  );

  const handleStartEdit = useCallback(
    (e: React.MouseEvent, ws: { id: number; name: string }) => {
      if (readOnly) return;
      e.stopPropagation();
      setEditingId(ws.id);
      setEditValue(ws.name);
      setTimeout(() => inputRef.current?.focus(), 0);
    },
    [readOnly],
  );

  const handleSaveEdit = useCallback(async () => {
    if (readOnly) return;
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
  }, [editingId, editValue, onRefresh, readOnly]);

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
    async (e: React.MouseEvent, ws: Workspace) => {
      if (readOnly) return;
      e.stopPropagation();
      setEditingId(null);
      const ok = await confirm({
        title: "删除项目",
        message: `确认删除「${ws.name}」？此操作不可恢复。`,
        confirmText: "删除",
        cancelText: "取消",
      });
      if (!ok) return;
      try {
        await deleteWorkspace(ws.id);
        if (ws.id === activeWorkspaceId) {
          const remaining = workspaces.filter((w) => w.id !== ws.id);
          if (remaining.length > 0) {
            onWorkspaceSelect(remaining[0]);
          }
        } else {
          void onRefresh();
        }
      } catch (e) {
        console.error("删除项目失败:", e);
      }
    },
    [activeWorkspaceId, onRefresh, onWorkspaceSelect, readOnly, workspaces],
  );

  const handleWorkbookDeleteClick = useCallback(
    async (e: React.MouseEvent, wb: WorkbookMeta) => {
      if (readOnly) return;
      e.stopPropagation();
      const ok = await confirm({
        title: "删除工作簿",
        message: `确认删除「${wb.name}」？此操作不可恢复。`,
        confirmText: "删除",
        cancelText: "取消",
      });
      if (!ok) return;
      try {
        await onWorkbookDelete(wb.id);
      } catch (e) {
        console.error("删除工作簿失败:", e);
      }
    },
    [onWorkbookDelete, readOnly],
  );

  const handleCreateWorkbook = useCallback(
    (e: React.MouseEvent, workspaceId: number) => {
      if (readOnly) return;
      e.stopPropagation();
      void onWorkbookCreate(workspaceId);
    },
    [onWorkbookCreate, readOnly],
  );

  const width = collapsed ? COLLAPSED_WIDTH : sidebarWidth;
  const transitionStyle = isResizing ? { transition: "none" as const } : undefined;
  return collapsed ? (
    <div className={`${styles.sidebar} ${styles.collapsed}`} style={{ width: COLLAPSED_WIDTH }}>
      <button
        className={styles.collapsedHomeButton}
        onClick={onNavigateHome}
        aria-label={homeLabel}
        title={homeLabel}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1.5" y="1.5" width="13" height="13" rx="3" stroke="currentColor" />
          <path d="M5 1.8v12.4M10.8 1.8v12.4M1.8 6.8h12.4" stroke="currentColor" />
        </svg>
      </button>
      <button
        className={styles.expandBtn}
        onClick={() => setCollapsed(false)}
        aria-label="展开工作区侧边栏"
        title="Expand sidebar"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M5 3l4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  ) : (
    <div ref={sidebarRef} className={styles.sidebar} style={{ width, ...transitionStyle }}>
      <div ref={innerRef} className={styles.inner} style={{ width }}>
        <button
          className={styles.homeButton}
          onClick={onNavigateHome}
          aria-label={homeLabel}
          title={homeLabel}
        >
          <span className={styles.homeMark} aria-hidden="true">
            <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
              <rect x="1.5" y="1.5" width="15" height="15" rx="3.5" stroke="currentColor" />
              <path d="M6 1.8v14.4M12.2 1.8v14.4M1.8 7.5h14.4" stroke="currentColor" />
            </svg>
          </span>
          <span className={styles.homeCopy}>
            <strong>OpenExcel</strong>
            <small>{homeLabel}</small>
          </span>
          <svg
            className={styles.homeArrow}
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M9 3L5 7l4 4"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className={styles.header}>
          <span className={styles.sectionLabel}>
            <small>{readOnly ? "DEMO SPACE" : "WORKSPACE"}</small>
            <strong>{t("workspaces", "工作区")}</strong>
          </span>
          <button
            className={styles.toggleBtn}
            onClick={() => setCollapsed(true)}
            aria-label="收起工作区侧边栏"
            title="Collapse sidebar"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M9 3L5 7l4 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
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
                  onClick={() => handleSelect(ws)}
                >
                  <span className={styles.itemIcon}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <rect
                        x="1.5"
                        y="1.5"
                        width="13"
                        height="13"
                        rx="2"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                      <path
                        d="M4 5h8M4 8h8M4 11h5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                  {editingId === ws.id ? (
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
                            <path
                              d="M2 3l3 3 3-3"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                      )}
                      {!readOnly && (
                        <span className={styles.itemActions}>
                          <button
                            className={styles.editBtn}
                            onClick={(e) => handleStartEdit(e, ws)}
                            title="重命名"
                          >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path
                                d="M8.5 1.5l2 2L4 10H2V8l6.5-6.5z"
                                stroke="currentColor"
                                strokeWidth="1.3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                          <button
                            className={styles.deleteBtn}
                            onClick={(e) => void handleDelete(e, ws)}
                            title="删除"
                          >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path
                                d="M2 3h8M4.5 3V2a1 1 0 011-1h1a1 1 0 011 1v1M9.5 3v7a1 1 0 01-1 1h-5a1 1 0 01-1-1V3"
                                stroke="currentColor"
                                strokeWidth="1.3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <path
                                d="M5 5.5v3M7 5.5v3"
                                stroke="currentColor"
                                strokeWidth="1.3"
                                strokeLinecap="round"
                              />
                            </svg>
                          </button>
                        </span>
                      )}
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
                              <rect
                                x="1.5"
                                y="2"
                                width="11"
                                height="10"
                                rx="1.5"
                                stroke="currentColor"
                                strokeWidth="1.3"
                              />
                              <path
                                d="M4 5h6M4 7h6M4 9h4"
                                stroke="currentColor"
                                strokeWidth="1.3"
                                strokeLinecap="round"
                              />
                            </svg>
                          </span>
                          <span className={styles.workbookName}>{wb.name}</span>
                          {!readOnly && (
                            <span className={styles.workbookActions}>
                              <button
                                className={styles.workbookDownloadBtn}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void downloadWorkbook(ws.id, wb.id, wb.name);
                                }}
                                title="下载"
                              >
                                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                                  <path
                                    d="M5.5 1v6M3 4.5l2.5 2.5L8 4.5"
                                    stroke="currentColor"
                                    strokeWidth="1.3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                  <path
                                    d="M1.5 8v1a1 1 0 001 1h6a1 1 0 001-1V8"
                                    stroke="currentColor"
                                    strokeWidth="1.3"
                                    strokeLinecap="round"
                                  />
                                </svg>
                              </button>
                              <button
                                className={styles.workbookDeleteBtn}
                                onClick={(e) => void handleWorkbookDeleteClick(e, wb)}
                                title="删除"
                              >
                                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                                  <path
                                    d="M2 2.5h7M4 2.5V1.5a1 1 0 011-1h1a1 1 0 011 1v1M8.5 2.5v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6"
                                    stroke="currentColor"
                                    strokeWidth="1.3"
                                    strokeLinecap="round"
                                  />
                                  <path
                                    d="M4.5 4v4M6.5 4v4"
                                    stroke="currentColor"
                                    strokeWidth="1.3"
                                    strokeLinecap="round"
                                  />
                                </svg>
                              </button>
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {!readOnly && (
                      <button
                        className={styles.workbookCreateBtn}
                        onClick={(e) => handleCreateWorkbook(e, ws.id)}
                        title="新建工作簿"
                      >
                        <span className={styles.plusIcon}>
                          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                            <path
                              d="M5.5 1v9M1 5.5h9"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                            />
                          </svg>
                        </span>
                        新建工作簿
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {readOnly ? (
          <div className={styles.demoNote}>
            <span className={styles.demoNoteIcon}>R</span>
            <span>
              <strong>只读回放空间</strong>
              <small>数据会随流程自动更新</small>
            </span>
          </div>
        ) : (
          <button className={styles.createBtn} onClick={handleCreate}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M6 1v10M1 6h10"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            {t("new_workspace", "新建项目")}
          </button>
        )}
      </div>
      <div className={styles.resizeHandle} onMouseDown={handleResizeMouseDown} />
    </div>
  );
}
