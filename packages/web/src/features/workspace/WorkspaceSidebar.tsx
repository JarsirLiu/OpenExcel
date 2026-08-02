import type { MouseEventHandler } from "react";
import { useCallback, useRef, useState } from "react";
import type { WorkbookMeta } from "@/api/workbooks";
import { downloadWorkbook } from "@/api/workbooks";
import type { Workspace } from "@/api/workspaces";
import { renameWorkspace } from "@/api/workspaces";
import { t } from "@/lib/i18n";
import { confirm } from "@/shared/lib";
import {
  WORKSPACE_SIDEBAR_COLLAPSED_WIDTH,
  type WorkspaceSidebarLayout,
} from "./useWorkspaceSidebarLayout";
import styles from "./WorkspaceSidebar.module.css";

type Props = {
  onNavigateHome: () => void;
  activeWorkspaceId: number | null;
  onWorkspaceSelect: (workspace: Workspace) => void;
  onWorkspaceCreate: () => Promise<Workspace>;
  onWorkspaceDelete: (workspaceId: number) => Promise<void>;
  workspaces: Workspace[];
  onRefresh: () => void;
  workbooksMap: Map<number, WorkbookMeta[]>;
  activeWorkbookId: number | null;
  onWorkbookSelect: (workspaceId: number, workbookId: number) => void;
  onWorkbookDelete: (workbookId: number) => Promise<void>;
  onWorkbookCreate: (workspaceId: number) => Promise<void>;
  homeLabel?: string;
  readOnly?: boolean;
  layout: WorkspaceSidebarLayout;
};

export function WorkspaceSidebar({
  onNavigateHome,
  activeWorkspaceId,
  onWorkspaceSelect,
  onWorkspaceCreate,
  onWorkspaceDelete,
  workspaces,
  onRefresh,
  workbooksMap,
  activeWorkbookId,
  onWorkbookSelect,
  onWorkbookDelete,
  onWorkbookCreate,
  homeLabel,
  readOnly = false,
  layout,
}: Props) {
  const resolvedHomeLabel = homeLabel ?? t("back_home");
  const {
    collapsed,
    width: sidebarWidth,
    isResizing,
    onToggleCollapsed,
    onResizeMouseDown,
  } = layout;
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<number>>(
    () => new Set(readOnly && activeWorkspaceId != null ? [activeWorkspaceId] : []),
  );
  const inputRef = useRef<HTMLInputElement>(null);
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
      const ws = await onWorkspaceCreate();
      onWorkspaceSelect(ws);
    } catch (e) {
      console.error("Failed to create project:", e);
    }
  }, [onWorkspaceCreate, onWorkspaceSelect, readOnly]);

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
      console.error("Failed to rename project:", e);
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
        title: t("delete_workspace"),
        message: t("confirm_delete_named", { name: ws.name }),
        confirmText: t("delete"),
        cancelText: t("cancel"),
      });
      if (!ok) return;
      try {
        await onWorkspaceDelete(ws.id);
      } catch (e) {
        console.error("Failed to delete project:", e);
      }
    },
    [onWorkspaceDelete, readOnly],
  );

  const handleWorkbookDeleteClick = useCallback(
    async (e: React.MouseEvent, wb: WorkbookMeta) => {
      if (readOnly) return;
      e.stopPropagation();
      const ok = await confirm({
        title: t("delete_workbook"),
        message: t("confirm_delete_named", { name: wb.name }),
        confirmText: t("delete"),
        cancelText: t("cancel"),
      });
      if (!ok) return;
      try {
        await onWorkbookDelete(wb.id);
      } catch (e) {
        console.error("Failed to delete workbook:", e);
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

  const width = collapsed ? WORKSPACE_SIDEBAR_COLLAPSED_WIDTH : sidebarWidth;
  const transitionStyle = isResizing ? { transition: "none" as const } : undefined;
  return collapsed ? (
    <div className={`${styles.sidebar} ${styles.collapsed}`} style={{ width }}>
      <button
        className={styles.collapsedHomeButton}
        onClick={onNavigateHome}
        aria-label={resolvedHomeLabel}
        title={resolvedHomeLabel}
      >
        <img src="/assets/openexcel-logo.svg" alt="" aria-hidden="true" />
      </button>
      <button
        className={styles.expandBtn}
        onClick={onToggleCollapsed}
        aria-label={t("expand_sidebar")}
        title={t("expand_sidebar")}
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
    <div className={styles.sidebar} style={{ width, ...transitionStyle }}>
      <div className={styles.inner}>
        <button
          className={styles.homeButton}
          onClick={onNavigateHome}
          aria-label={resolvedHomeLabel}
          title={resolvedHomeLabel}
        >
          <span className={styles.homeMark} aria-hidden="true">
            <img src="/assets/openexcel-logo.svg" alt="" />
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
            <small>{readOnly ? t("demo_space") : t("workspaces")}</small>
            <strong>{t("workspaces")}</strong>
          </span>
          <button
            className={styles.toggleBtn}
            onClick={onToggleCollapsed}
            aria-label={t("collapse_sidebar")}
            title={t("collapse_sidebar")}
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
                            title={t("rename")}
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
                            title={t("delete")}
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
                                title={t("download")}
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
                                title={t("delete")}
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
                        title={t("new_workbook")}
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
                        {t("new_workbook")}
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
              <strong>{t("read_only_demo_space")}</strong>
              <small>{t("demo_data_auto_updates")}</small>
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
            {t("new_workspace")}
          </button>
        )}
      </div>
      <div className={styles.resizeHandle} onMouseDown={onResizeMouseDown as MouseEventHandler} />
    </div>
  );
}
