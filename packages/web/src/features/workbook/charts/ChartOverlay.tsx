import { useMemo } from "react";
import type { WorkbookFull } from "@/api/workbooks";
import type { SheetGridLayout } from "../layout/fortuneSheetLayout";
import { normalizeSheetId } from "../sheetIdentity";
import { ChartDataLayer } from "./ChartDataLayer";
import styles from "./ChartOverlay.module.css";
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
  const viewport = useChartViewport({ containerRef, layerRef, sheetId: activeSheetId });
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
          ...viewport.rectToViewport(rect),
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
            <ChartDataLayer
              chart={chart}
              workbook={workbook}
              sheetLoaded={sheetLoaded}
              onSheetLoad={onSheetLoad}
            />
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
