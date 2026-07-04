import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";

type MentionItem = {
  id: string;
  label: string;
  kind: "workbook" | "sheet";
  workbookId: number;
  workbookName: string;
};

export type WorkbookSource = {
  workbookId: number;
  workbookName: string;
  sheetId: number;
  sheetName: string;
};

type WorkbookGroup = {
  workbookId: number;
  workbookName: string;
  workbookItem: MentionItem | null;
  sheets: MentionItem[];
};

type ActivePane = "workbook" | "sheet";

function buildGroups(items: MentionItem[]): WorkbookGroup[] {
  const grouped = new Map<number, WorkbookGroup>();

  for (const item of items) {
    const existing = grouped.get(item.workbookId);
    if (existing) {
      if (item.kind === "workbook") {
        existing.workbookItem = item;
      } else {
        existing.sheets.push(item);
      }
      continue;
    }

    grouped.set(item.workbookId, {
      workbookId: item.workbookId,
      workbookName: item.workbookName,
      workbookItem: item.kind === "workbook" ? item : null,
      sheets: item.kind === "sheet" ? [item] : [],
    });
  }

  return Array.from(grouped.values());
}

export const MentionList = forwardRef<
  { onKeyDown: (event: KeyboardEvent) => boolean },
  { items: MentionItem[]; command: (item: MentionItem) => void }
>((props, ref) => {
  const groups = useMemo(() => buildGroups(props.items), [props.items]);
  const [activeWorkbookId, setActiveWorkbookId] = useState<number | null>(
    () => groups[0]?.workbookId ?? null,
  );
  const [activePane, setActivePane] = useState<ActivePane>("workbook");
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const activeGroup = useMemo(
    () => groups.find((group) => group.workbookId === activeWorkbookId) ?? null,
    [activeWorkbookId, groups],
  );

  useEffect(() => {
    if (groups.length === 0) {
      setActiveWorkbookId(null);
      setActivePane("workbook");
      setActiveSheetIndex(0);
      return;
    }

    const workbookExists = activeWorkbookId != null
      && groups.some((group) => group.workbookId === activeWorkbookId);
    if (!workbookExists) {
      setActiveWorkbookId(groups[0].workbookId);
      setActivePane("workbook");
      setActiveSheetIndex(0);
    }
  }, [activeWorkbookId, groups]);

  useEffect(() => {
    if (!activeGroup) return;
    if (activeGroup.sheets.length === 0) {
      if (activePane === "sheet") {
        setActivePane("workbook");
      }
      if (activeSheetIndex !== 0) {
        setActiveSheetIndex(0);
      }
      return;
    }

    if (activeSheetIndex >= activeGroup.sheets.length) {
      setActiveSheetIndex(0);
    }
  }, [activeGroup, activePane, activeSheetIndex]);

  useEffect(() => {
    const selectedEl = listRef.current?.querySelector<HTMLElement>("[data-mention-selected='true']");
    selectedEl?.scrollIntoView({ block: "nearest" });
  }, [activePane, activeSheetIndex, activeWorkbookId, groups]);

  const selectItem = (item: MentionItem) => {
    props.command(item);
  };

  const activateWorkbook = (workbookId: number, pane: ActivePane = "workbook") => {
    setActiveWorkbookId(workbookId);
    setActivePane(pane);
    if (pane === "workbook") {
      setActiveSheetIndex(0);
    }
  };

  const moveWorkbook = (delta: number) => {
    if (groups.length === 0) return;
    const currentIndex = Math.max(0, groups.findIndex((group) => group.workbookId === activeWorkbookId));
    const nextIndex = (currentIndex + delta + groups.length) % groups.length;
    setActiveWorkbookId(groups[nextIndex].workbookId);
    setActivePane("workbook");
    setActiveSheetIndex(0);
  };

  const moveSheet = (delta: number) => {
    if (!activeGroup || activeGroup.sheets.length === 0) return;
    const nextIndex = (activeSheetIndex + delta + activeGroup.sheets.length) % activeGroup.sheets.length;
    setActiveSheetIndex(nextIndex);
    setActivePane("sheet");
  };

  const enterHandler = () => {
    if (!activeGroup) return;
    if (activePane === "sheet" && activeGroup.sheets.length > 0) {
      const sheet = activeGroup.sheets[activeSheetIndex] ?? activeGroup.sheets[0];
      if (sheet) {
        selectItem(sheet);
      }
      return;
    }

    if (activeGroup.workbookItem) {
      selectItem(activeGroup.workbookItem);
    }
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (event.key === "ArrowUp") {
        if (activePane === "sheet" && activeGroup?.sheets.length) {
          moveSheet(-1);
        } else {
          moveWorkbook(-1);
        }
        return true;
      }
      if (event.key === "ArrowDown") {
        if (activePane === "sheet" && activeGroup?.sheets.length) {
          moveSheet(1);
        } else {
          moveWorkbook(1);
        }
        return true;
      }
      if (event.key === "ArrowLeft") {
        if (activePane === "sheet") {
          setActivePane("workbook");
          return true;
        }
        return false;
      }
      if (event.key === "ArrowRight") {
        if (activeGroup?.sheets.length) {
          setActivePane("sheet");
          setActiveSheetIndex((current) => Math.min(current, activeGroup.sheets.length - 1));
          return true;
        }
        return false;
      }
      if (event.key === "Enter") {
        enterHandler();
        return true;
      }
      return false;
    },
  }));

  const getSelectedIndexForSheet = (sheetId: number) =>
    activeGroup?.sheets.findIndex((item) => item.id === `sheet:${sheetId}`) ?? -1;

  return (
    <div
      ref={listRef}
      style={{
        background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(250,252,255,0.98) 100%)",
        border: "1px solid rgba(148, 163, 184, 0.28)",
        borderRadius: 14,
        boxShadow: "0 18px 40px rgba(15, 23, 42, 0.12)",
        overflow: "hidden",
        minWidth: 480,
        maxHeight: 288,
        backdropFilter: "blur(10px)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {groups.length === 0 ? (
        <div style={{ padding: "12px 14px", fontSize: 13, color: "var(--hint-foreground)" }}>无匹配的 Sheet</div>
      ) : (
        <div style={{ display: "flex", minHeight: 0, flex: 1 }}>
          <div
            style={{
              width: 212,
              borderRight: "1px solid rgba(148, 163, 184, 0.18)",
              overflowY: "auto",
              background: "linear-gradient(180deg, rgba(248,250,252,0.95) 0%, rgba(241,245,249,0.92) 100%)",
            }}
          >
            <div style={{
              padding: "10px 12px 8px",
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--hint-foreground)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <span>工作簿</span>
              <span style={{
                padding: "2px 8px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.7)",
                color: "var(--muted-foreground)",
                border: "1px solid rgba(148, 163, 184, 0.18)",
              }}>
                {groups.length}
              </span>
            </div>
            {groups.map((group) => {
              const isSelected = activeGroup?.workbookId === group.workbookId && activePane === "workbook";
              const countLabel = group.sheets.length > 99 ? "99+" : String(group.sheets.length);

              return (
                <div
                  key={group.workbookId}
                  data-mention-selected={isSelected ? "true" : "false"}
                  onMouseEnter={() => activateWorkbook(group.workbookId, "workbook")}
                  onClick={() => {
                    if (group.workbookItem) {
                      selectItem(group.workbookItem);
                    }
                  }}
                  style={{
                    margin: "0 8px 6px",
                    padding: "10px 10px 10px 12px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: isSelected
                      ? "linear-gradient(135deg, rgba(219, 234, 254, 0.95) 0%, rgba(239, 246, 255, 0.95) 100%)"
                      : "rgba(255,255,255,0.55)",
                    fontSize: 13,
                    color: "var(--foreground)",
                    borderRadius: 12,
                    border: isSelected ? "1px solid rgba(59, 130, 246, 0.18)" : "1px solid transparent",
                    boxShadow: isSelected ? "0 8px 18px rgba(59, 130, 246, 0.08)" : "none",
                  }}
                >
                  <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: isSelected ? "#3b82f6" : "#cbd5e1",
                    flexShrink: 0,
                  }} />
                  <span
                    style={{
                      fontWeight: 600,
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {group.workbookName}
                  </span>
                  <span style={{
                    fontSize: 11,
                    color: isSelected ? "#1d4ed8" : "#64748b",
                    flexShrink: 0,
                    fontWeight: 600,
                    padding: "3px 8px",
                    borderRadius: 999,
                    background: isSelected ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.65)",
                    border: "1px solid rgba(148, 163, 184, 0.16)",
                  }}>
                    {countLabel}
                  </span>
                </div>
              );
            })}
          </div>

          <div style={{
            flex: 1,
            minWidth: 0,
            overflowY: "auto",
            background: "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.98) 100%)",
          }}>
            {activeGroup ? (
              activeGroup.sheets.length > 0 ? (
                <>
                  <div style={{
                    padding: "10px 14px 8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: 11,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
              color: "var(--hint-foreground)",
                        marginBottom: 3,
                      }}>
                        Sheet
                      </div>
                      <div style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "var(--foreground)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: 240,
                      }}>
                        {activeGroup.workbookName}
                      </div>
                    </div>
                    <div style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: "rgba(59, 130, 246, 0.08)",
                      color: "#1d4ed8",
                      fontSize: 12,
                      fontWeight: 600,
                      flexShrink: 0,
                    }}>
                      {activeGroup.sheets.length} 个 sheet
                    </div>
                  </div>
                  <div style={{ padding: "0 8px 10px" }}>
                    {activeGroup.sheets.map((item, index) => {
                      const sheetId = Number(item.id.replace("sheet:", ""));
                      const visibleIndex = getSelectedIndexForSheet(sheetId);
                      const isSelected = activePane === "sheet" && activeGroup.sheets[activeSheetIndex]?.id === item.id;

                      return (
                        <div
                          key={item.id}
                          data-mention-selected={isSelected ? "true" : "false"}
                          onMouseEnter={() => {
                            if (visibleIndex >= 0) {
                              setActivePane("sheet");
                              setActiveSheetIndex(visibleIndex);
                            }
                          }}
                          onClick={() => selectItem(item)}
                          style={{
                            padding: "10px 12px",
                            marginBottom: 6,
                            cursor: "pointer",
                            fontSize: 13,
                            color: "var(--foreground)",
                            background: isSelected
                              ? "linear-gradient(135deg, rgba(219, 234, 254, 0.85) 0%, rgba(239, 246, 255, 0.9) 100%)"
                              : "rgba(255,255,255,0.7)",
                            borderRadius: 12,
                            border: isSelected ? "1px solid rgba(59, 130, 246, 0.18)" : "1px solid rgba(148, 163, 184, 0.12)",
                            boxShadow: isSelected ? "0 8px 16px rgba(59, 130, 246, 0.08)" : "none",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <span style={{
                            width: 24,
                            height: 24,
                            borderRadius: 8,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: isSelected ? "rgba(59, 130, 246, 0.12)" : "rgba(148, 163, 184, 0.12)",
                            color: isSelected ? "#1d4ed8" : "#64748b",
                            fontSize: 12,
                            fontWeight: 700,
                            flexShrink: 0,
                          }}>
                            {index + 1}
                          </span>
                          <span style={{
                            fontWeight: 600,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            flex: 1,
                          }}>
                            {item.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div style={{ padding: "14px", fontSize: 13, color: "var(--hint-foreground)", lineHeight: 1.6 }}>
                  这个工作簿下没有可引用的 sheet，按 Enter 可直接引用工作簿。
                </div>
              )
            ) : (
              <div style={{ padding: "14px", fontSize: 13, color: "var(--hint-foreground)" }}>请选择一个工作簿。</div>
            )}
          </div>
        </div>
      )}
      {groups.length > 0 && (
        <div style={{
          padding: "6px 12px",
          borderTop: "1px solid rgba(148, 163, 184, 0.18)",
          fontSize: 11,
          color: "var(--muted-foreground)",
          background: "rgba(248, 250, 252, 0.92)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}>
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>↑↓ 切换，→ 进入 sheet，← 返回工作簿，Enter 选中</span>
          <span style={{ color: "var(--hint-foreground)" }}>
            {activePane === "sheet" ? "当前在 sheet 列" : "当前在工作簿列"}
          </span>
        </div>
      )}
    </div>
  );
});

export function createMentionSuggestion(
  loadSheets: (signal: AbortSignal) => Promise<WorkbookSource[]>,
  options?: { onOpenChange?: (open: boolean) => void },
) {
  return {
    char: "@",
    items: async ({ query, signal }: { query: string; signal: AbortSignal }) => {
      const normalized = query.toLowerCase();
      const grouped = new Map<number, WorkbookSource[]>();

      for (const sheet of await loadSheets(signal)) {
        const list = grouped.get(sheet.workbookId);
        if (list) {
          list.push(sheet);
        } else {
          grouped.set(sheet.workbookId, [sheet]);
        }
      }

      const items: MentionItem[] = [];

      for (const [workbookId, sheets] of grouped.entries()) {
        const workbookName = sheets[0]?.workbookName ?? "";
        const matchingSheets = sheets.filter((sheet) =>
          sheet.sheetName.toLowerCase().includes(normalized)
          || workbookName.toLowerCase().includes(normalized),
        );
        const workbookMatches = workbookName.toLowerCase().includes(normalized) || matchingSheets.length > 0;
        if (!workbookMatches) continue;

        items.push({
          id: `workbook:${workbookId}`,
          label: workbookName,
          kind: "workbook",
          workbookId,
          workbookName,
        });

        for (const sheet of matchingSheets) {
          items.push({
            id: `sheet:${sheet.sheetId}`,
            label: sheet.sheetName,
            kind: "sheet",
            workbookId,
            workbookName,
          });
        }
      }

      return items;
    },
    render: () => {
      let component: ReactRenderer<{ onKeyDown: (event: KeyboardEvent) => boolean }>;
      let unmount: () => void;

      return {
        onStart: (props: SuggestionProps) => {
          options?.onOpenChange?.(true);
          component = new ReactRenderer(MentionList, {
            props: {
              items: props.items as MentionItem[],
              command: (item: MentionItem) => {
                props.command(item);
              },
            },
            editor: props.editor,
          });
          unmount = props.mount(component.element);
        },
        onUpdate: (props: SuggestionProps) => {
          component.updateProps({
            items: props.items as MentionItem[],
            command: (item: MentionItem) => {
              props.command(item);
            },
          });
        },
        onKeyDown: (props: SuggestionKeyDownProps) => {
          if (props.event.key === "Escape") {
            unmount?.();
            return true;
          }
          return component.ref?.onKeyDown(props.event) ?? false;
        },
        onExit: () => {
          options?.onOpenChange?.(false);
          unmount?.();
          component?.destroy();
        },
      };
    },
  };
}
