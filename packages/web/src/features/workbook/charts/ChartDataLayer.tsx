import type { ChartSpec } from "@openexcel/core";
import { Suspense, useCallback, useSyncExternalStore } from "react";
import type { WorkbookDocumentStore } from "@/features/workspace/WorkbookDocumentStore";
import { selectChartSheets } from "./ChartDataSelector";
import { chartAffectsChange } from "./ChartInvalidationIndex";
import styles from "./ChartOverlay.module.css";
import { ChartRendererBoundary } from "./ChartRendererBoundary";
import { useChartDependencies } from "./useChartDependencies";

type Props = {
  chart: ChartSpec;
  documentStore: WorkbookDocumentStore;
  sheetLoaded: boolean;
  onSheetLoad: (sheetId: number) => Promise<void>;
};

export function ChartDataLayer({ chart, documentStore, sheetLoaded, onSheetLoad }: Props) {
  const subscribeToChartChanges = useCallback(
    (listener: () => void) =>
      documentStore.subscribeToChanges((change) => {
        if (chartAffectsChange(chart, change)) listener();
      }),
    [chart, documentStore],
  );
  const workbook = useSyncExternalStore(
    subscribeToChartChanges,
    documentStore.getSnapshot,
    documentStore.getSnapshot,
  );
  const { dependencyError, missingDependencyIds, retryDependencies } = useChartDependencies({
    charts: [chart],
    sheets: workbook?.sheets ?? [],
    enabled: sheetLoaded,
    onSheetLoad,
  });

  if (!workbook) return null;

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
      <ChartRendererBoundary chart={chart} sheets={selectChartSheets(chart, workbook.sheets)} />
    </Suspense>
  );
}
