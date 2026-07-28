import type { ChartSpec } from "@openexcel/core";
import { Suspense } from "react";
import type { WorkbookFull } from "@/api/workbooks";
import styles from "./ChartOverlay.module.css";
import { ChartRendererBoundary } from "./ChartRendererBoundary";
import { useChartDependencies } from "./useChartDependencies";

type Props = {
  chart: ChartSpec;
  workbook: WorkbookFull;
  sheetLoaded: boolean;
  onSheetLoad: (sheetId: number) => Promise<void>;
};

export function ChartDataLayer({ chart, workbook, sheetLoaded, onSheetLoad }: Props) {
  const { dependencyError, missingDependencyIds, retryDependencies } = useChartDependencies({
    charts: [chart],
    sheets: workbook.sheets,
    enabled: sheetLoaded,
    onSheetLoad,
  });

  if (missingDependencyIds.length > 0 || dependencyError) {
    return (
      <div className={styles.loading} role="status">
        {dependencyError ? (
          <>
            <span>{dependencyError}</span>
            <button
              type="button"
              className={styles.retry}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={retryDependencies}
            >
              重试
            </button>
          </>
        ) : (
          "正在加载图表数据..."
        )}
      </div>
    );
  }

  return (
    <Suspense fallback={<div className={styles.loading}>正在加载图表...</div>}>
      <ChartRendererBoundary chart={chart} sheets={workbook.sheets} />
    </Suspense>
  );
}
