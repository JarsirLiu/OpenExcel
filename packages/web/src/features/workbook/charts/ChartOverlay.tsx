import { chartDependencySheetIds } from "@openexcel/core";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { WorkbookFull } from "@/api/workbooks";
import type { SheetGridLayout } from "../layout/fortuneSheetLayout";
import { normalizeSheetId } from "../sheetIdentity";
import styles from "./ChartOverlay.module.css";
import { ChartRendererBoundary } from "./ChartRendererBoundary";
import { chartsForSheet } from "./chartBinding";
import { chartRectWithMinimumSize, useChartOverlayInteraction } from "./useChartOverlayInteraction";
import { useChartViewport } from "./useChartViewport";

type Props = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  layerRef: React.RefObject<HTMLDivElement | null>;
  workspaceId: number | null;
  workbook: WorkbookFull;
  sheetId: string;
  layout: SheetGridLayout;
  onWorkbookRefresh?: () => Promise<void> | void;
  onWorkbookMutation?: () => Promise<void> | void;
  sheetLoaded: boolean;
  onSheetLoad: (sheetId: number) => Promise<void>;
};

const HANDLE_DIRECTIONS = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;

export function ChartOverlay({
  containerRef,
  layerRef,
  workspaceId,
  workbook,
  sheetId,
  layout,
  onWorkbookRefresh,
  onWorkbookMutation,
  sheetLoaded,
  onSheetLoad,
}: Props) {
  const activeSheetId = normalizeSheetId(sheetId);
  const charts = useMemo(
    () => chartsForSheet(workbook.charts, activeSheetId),
    [activeSheetId, workbook.charts],
  );
  const scroll = useChartViewport({ containerRef, layerRef, sheetId: activeSheetId });
  const [dependencyError, setDependencyError] = useState<string | null>(null);
  const requestedDependencyIdsRef = useRef(new Set<number>());
  const dependencySheetIds = useMemo(() => {
    const ids = charts.flatMap((chart) => chartDependencySheetIds(chart));
    return [...new Set(ids)].map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
  }, [charts]);
  const missingDependencyIds = useMemo(
    () =>
      dependencySheetIds.filter((id) => {
        const sheet = workbook.sheets.find((item) => item.id === id);
        return sheet?.loaded === false;
      }),
    [dependencySheetIds, workbook.sheets],
  );

  useEffect(() => {
    if (!sheetLoaded || missingDependencyIds.length === 0) return;
    const pendingIds = missingDependencyIds.filter(
      (id) => !requestedDependencyIdsRef.current.has(id),
    );
    if (pendingIds.length === 0) return;
    for (const id of pendingIds) requestedDependencyIdsRef.current.add(id);
    setDependencyError(null);
    void (async () => {
      try {
        for (const id of pendingIds) await onSheetLoad(id);
      } catch (error) {
        for (const id of pendingIds) requestedDependencyIdsRef.current.delete(id);
        setDependencyError(error instanceof Error ? error.message : "加载图表数据失败");
      }
    })();
  }, [missingDependencyIds, onSheetLoad, sheetLoaded]);
  const {
    beginInteraction,
    displayCharts,
    error,
    interaction,
    removeChart,
    selectedId,
    setSelectedId,
  } = useChartOverlayInteraction({
    activeSheetId,
    charts,
    layout,
    workspaceId,
    onWorkbookRefresh,
    onWorkbookMutation,
  });

  if (charts.length === 0) return null;

  return (
    <div className={styles.layer}>
      {displayCharts.map((chart) => {
        const rect = chartRectWithMinimumSize(chart, layout, interaction);
        const selected = selectedId === chart.id;
        const style = {
          left: layout.rowHeaderWidth * layout.zoomRatio + rect.left - scroll.left,
          top: layout.columnHeaderHeight * layout.zoomRatio + rect.top - scroll.top,
          width: rect.width,
          height: rect.height,
          zIndex: selected ? 2 : 1,
        };

        return (
          <article
            className={`${styles.item} ${selected ? styles.selected : ""}`}
            key={chart.id}
            style={style}
            tabIndex={selected ? 0 : -1}
            aria-label={chart.title || "图表"}
            onPointerDown={(event) => beginInteraction(event, chart.id, "move", rect)}
            onClick={(event) => {
              event.stopPropagation();
              setSelectedId(chart.id);
            }}
          >
            {missingDependencyIds.length > 0 || dependencyError ? (
              <div className={styles.loading} role="status">
                {dependencyError ?? "正在加载图表数据..."}
              </div>
            ) : (
              <Suspense fallback={<div className={styles.loading}>正在加载图表...</div>}>
                <ChartRendererBoundary chart={chart} sheets={workbook.sheets} />
              </Suspense>
            )}
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
                  <span className={styles.closeIcon} aria-hidden="true">
                    ×
                  </span>
                </button>
                {HANDLE_DIRECTIONS.map((direction) => (
                  <span
                    className={`${styles.handle} ${styles[direction]}`}
                    key={direction}
                    role="presentation"
                    onPointerDown={(event) =>
                      beginInteraction(event, chart.id, { resize: direction }, rect)
                    }
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
    </div>
  );
}
