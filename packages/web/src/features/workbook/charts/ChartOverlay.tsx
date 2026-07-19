import type { ChartAnchor, ChartSpec } from "@openexcel/core";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { deleteChart, updateChart } from "@/api/charts";
import type { WorkbookFull } from "@/api/workbooks";
import type { SheetGridLayout } from "../layout/fortuneSheetLayout";
import styles from "./ChartOverlay.module.css";
import { ChartRenderer } from "./ChartRenderer";
import {
  type ChartRect,
  chartAnchorKind,
  chartAnchorToRect,
  chartRectEquals,
  rectToChartAnchor,
} from "./chartAnchorGeometry";

type ResizeDirection = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
type InteractionMode = "move" | { resize: ResizeDirection };

type Interaction = {
  chartId: string;
  mode: InteractionMode;
  startX: number;
  startY: number;
  startRect: ChartRect;
  rect: ChartRect;
  moved: boolean;
};

type Props = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  workspaceId: number | null;
  workbook: WorkbookFull;
  sheetId: string;
  layout: SheetGridLayout;
  onWorkbookRefresh?: () => Promise<void> | void;
  onWorkbookMutation?: () => Promise<void> | void;
};

const MIN_WIDTH = 240;
const MIN_HEIGHT = 160;
const HANDLE_DIRECTIONS: ResizeDirection[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

function getChartRect(chart: ChartSpec, layout: SheetGridLayout, interaction: Interaction | null) {
  const rect =
    interaction?.chartId === chart.id ? interaction.rect : chartAnchorToRect(chart.anchor, layout);
  return {
    ...rect,
    width: Math.max(MIN_WIDTH, rect.width),
    height: Math.max(MIN_HEIGHT, rect.height),
  };
}

function resizeRect(
  start: ChartRect,
  direction: ResizeDirection,
  deltaX: number,
  deltaY: number,
): ChartRect {
  let left = start.left;
  let top = start.top;
  let right = start.left + start.width;
  let bottom = start.top + start.height;

  if (direction.includes("w")) left = Math.min(right - MIN_WIDTH, start.left + deltaX);
  if (direction.includes("e"))
    right = Math.max(left + MIN_WIDTH, start.left + start.width + deltaX);
  if (direction.includes("n")) top = Math.min(bottom - MIN_HEIGHT, start.top + deltaY);
  if (direction.includes("s"))
    bottom = Math.max(top + MIN_HEIGHT, start.top + start.height + deltaY);

  left = Math.max(0, left);
  top = Math.max(0, top);
  return { left, top, width: right - left, height: bottom - top };
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function ChartOverlay({
  containerRef,
  workspaceId,
  workbook,
  sheetId,
  layout,
  onWorkbookRefresh,
  onWorkbookMutation,
}: Props) {
  const charts = useMemo(
    () => workbook.charts.filter((chart) => chart.sheetId === sheetId),
    [sheetId, workbook.charts],
  );
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [scroll, setScroll] = useState({ left: 0, top: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [interaction, setInteraction] = useState<Interaction | null>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const [anchorOverrides, setAnchorOverrides] = useState<Record<string, ChartAnchor>>({});
  const [error, setError] = useState<string | null>(null);

  const displayCharts = useMemo(
    () =>
      charts.map((chart) => {
        const anchor = anchorOverrides[chart.id];
        return anchor ? { ...chart, anchor } : chart;
      }),
    [anchorOverrides, charts],
  );

  const updateInteraction = useCallback((next: Interaction | null) => {
    interactionRef.current = next;
    setInteraction(next);
  }, []);

  const notifyLayoutChange = useCallback(() => {
    const root = containerRef.current;
    setScroll({
      left: root?.querySelector<HTMLElement>(".luckysheet-scrollbar-x")?.scrollLeft ?? 0,
      top: root?.querySelector<HTMLElement>(".luckysheet-scrollbar-y")?.scrollTop ?? 0,
    });
  }, []);

  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    let frame = 0;
    let currentTarget: HTMLElement | null = null;
    const findTarget = () => {
      const target = root.querySelector<HTMLElement>(".fortune-sheet-overlay");
      if (target === currentTarget) return;
      currentTarget = target;
      setPortalTarget(target);
      if (target) notifyLayoutChange();
    };

    findTarget();
    const observer = new MutationObserver(findTarget);
    observer.observe(root, { childList: true, subtree: true });
    frame = requestAnimationFrame(findTarget);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [containerRef, sheetId, notifyLayoutChange]);

  useEffect(() => {
    const root = containerRef.current;
    const target = portalTarget;
    if (!root || !target) return;

    const horizontal = root.querySelector<HTMLElement>(".luckysheet-scrollbar-x");
    const vertical = root.querySelector<HTMLElement>(".luckysheet-scrollbar-y");
    const handleScroll = () => notifyLayoutChange();
    horizontal?.addEventListener("scroll", handleScroll);
    vertical?.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", handleScroll);
    const observer = new ResizeObserver(handleScroll);
    observer.observe(target);

    return () => {
      horizontal?.removeEventListener("scroll", handleScroll);
      vertical?.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
      observer.disconnect();
    };
  }, [containerRef, notifyLayoutChange, portalTarget]);

  useEffect(() => {
    if (selectedId && !charts.some((chart) => chart.id === selectedId)) setSelectedId(null);
  }, [charts, selectedId]);

  useEffect(() => {
    setAnchorOverrides({});
  }, [workbook]);

  useEffect(() => {
    if (interactionRef.current) updateInteraction(null);
  }, [layout, updateInteraction]);

  const persistAnchor = useCallback(
    async (chart: ChartSpec, rect: ChartRect) => {
      if (workspaceId == null) return;
      if (chartRectEquals(rect, chartAnchorToRect(chart.anchor, layout))) return;

      setError(null);
      try {
        const updatedChart = await updateChart(workspaceId, chart.id, {
          anchor: rectToChartAnchor(rect, layout, chartAnchorKind(chart)),
        });
        setAnchorOverrides((current) => ({ ...current, [chart.id]: updatedChart.anchor }));
        await onWorkbookMutation?.();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "保存图表位置失败");
      }
    },
    [layout, onWorkbookMutation, workspaceId],
  );

  const removeChart = useCallback(
    async (chartId: string) => {
      if (workspaceId == null) return;
      setError(null);
      try {
        await deleteChart(workspaceId, chartId);
        setSelectedId(null);
        await onWorkbookRefresh?.();
        await onWorkbookMutation?.();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "删除图表失败");
      }
    },
    [onWorkbookMutation, onWorkbookRefresh, workspaceId],
  );

  useEffect(() => {
    if (!selectedId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedId(null);
        updateInteraction(null);
        return;
      }
      if (event.key === "Delete" && !isTextEntryTarget(event.target)) {
        event.preventDefault();
        void removeChart(selectedId);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [removeChart, selectedId]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const current = interactionRef.current;
      if (!current) return;
      const deltaX = event.clientX - current.startX;
      const deltaY = event.clientY - current.startY;
      const rect =
        current.mode === "move"
          ? {
              ...current.startRect,
              left: Math.max(0, current.startRect.left + deltaX),
              top: Math.max(0, current.startRect.top + deltaY),
            }
          : resizeRect(current.startRect, current.mode.resize, deltaX, deltaY);
      updateInteraction({
        ...current,
        rect,
        moved: current.moved || Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2,
      });
    };

    const onPointerUp = () => {
      const current = interactionRef.current;
      updateInteraction(null);
      if (!current) return;
      if (!current.moved) return;
      const chart = displayCharts.find((item) => item.id === current.chartId);
      if (chart) void persistAnchor(chart, current.rect);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [displayCharts, persistAnchor, updateInteraction]);

  if (!portalTarget || charts.length === 0) return null;

  return createPortal(
    <div className={styles.layer}>
      {displayCharts.map((chart) => {
        const rect = getChartRect(chart, layout, interaction);
        const selected = selectedId === chart.id;
        const style = {
          left: layout.rowHeaderWidth * layout.zoomRatio + rect.left - scroll.left,
          top: layout.columnHeaderHeight * layout.zoomRatio + rect.top - scroll.top,
          width: rect.width,
          height: rect.height,
        };

        const beginInteraction = (event: React.PointerEvent, mode: InteractionMode) => {
          event.preventDefault();
          event.stopPropagation();
          setError(null);
          setSelectedId(chart.id);
          updateInteraction({
            chartId: chart.id,
            mode,
            startX: event.clientX,
            startY: event.clientY,
            startRect: rect,
            rect,
            moved: false,
          });
          event.currentTarget.setPointerCapture?.(event.pointerId);
        };

        return (
          <article
            className={`${styles.item} ${selected ? styles.selected : ""}`}
            key={chart.id}
            style={style}
            tabIndex={selected ? 0 : -1}
            aria-label={chart.title || "图表"}
            onPointerDown={(event) => beginInteraction(event, "move")}
            onClick={(event) => {
              event.stopPropagation();
              setSelectedId(chart.id);
            }}
          >
            <ChartRenderer chart={chart} sheets={workbook.sheets} />
            {selected ? (
              <>
                <button
                  type="button"
                  className={styles.delete}
                  aria-label="删除图表"
                  title="删除图表"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => void removeChart(chart.id)}
                >
                  ×
                </button>
                {HANDLE_DIRECTIONS.map((direction) => (
                  <span
                    className={`${styles.handle} ${styles[direction]}`}
                    key={direction}
                    role="presentation"
                    onPointerDown={(event) => beginInteraction(event, { resize: direction })}
                  />
                ))}
              </>
            ) : null}
          </article>
        );
      })}
      {error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : null}
    </div>,
    portalTarget,
  );
}
