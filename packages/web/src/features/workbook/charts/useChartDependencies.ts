import { type ChartSpec, chartDependencySheetIds } from "@openexcel/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SheetSchema } from "@/api/workbooks";

type Props = {
  charts: readonly ChartSpec[];
  sheets: readonly SheetSchema[];
  enabled: boolean;
  onSheetLoad: (sheetId: number) => Promise<void>;
};

function toSheetId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function useChartDependencies({ charts, sheets, enabled, onSheetLoad }: Props) {
  const requestedIdsRef = useRef(new Set<number>());
  const inFlightIdsRef = useRef(new Set<number>());
  const latestMissingIdsRef = useRef(new Set<number>());
  const [dependencyError, setDependencyError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const dependencySheetIds = useMemo(() => {
    const ids = charts.flatMap((chart) => chartDependencySheetIds(chart));
    return [...new Set(ids)].map(toSheetId).filter((id): id is number => id !== null);
  }, [charts]);
  const missingDependencyIds = useMemo(
    () =>
      dependencySheetIds.filter((id) => {
        const sheet = sheets.find((item) => item.id === id);
        return sheet?.loaded === false;
      }),
    [dependencySheetIds, sheets],
  );
  latestMissingIdsRef.current = new Set(missingDependencyIds);

  useEffect(() => {
    const missingIds = new Set(missingDependencyIds);
    for (const requestedId of requestedIdsRef.current) {
      if (!missingIds.has(requestedId) && !inFlightIdsRef.current.has(requestedId)) {
        requestedIdsRef.current.delete(requestedId);
      }
    }

    if (!enabled || missingDependencyIds.length === 0) {
      setDependencyError(null);
      return;
    }

    const pendingIds = missingDependencyIds.filter(
      (id) => !requestedIdsRef.current.has(id) && !inFlightIdsRef.current.has(id),
    );
    if (pendingIds.length === 0) return;

    for (const id of pendingIds) {
      requestedIdsRef.current.add(id);
      inFlightIdsRef.current.add(id);
    }
    setDependencyError(null);
    void (async () => {
      for (const id of pendingIds) {
        try {
          await onSheetLoad(id);
        } catch (error) {
          requestedIdsRef.current.delete(id);
          if (latestMissingIdsRef.current.has(id)) {
            setDependencyError(error instanceof Error ? error.message : "加载图表数据失败");
          }
        } finally {
          inFlightIdsRef.current.delete(id);
          if (!latestMissingIdsRef.current.has(id)) requestedIdsRef.current.delete(id);
        }
      }
    })();
  }, [enabled, missingDependencyIds, onSheetLoad, retryAttempt]);

  const retryDependencies = useCallback(() => {
    for (const id of missingDependencyIds) {
      if (!inFlightIdsRef.current.has(id)) requestedIdsRef.current.delete(id);
    }
    setDependencyError(null);
    setRetryAttempt((attempt) => attempt + 1);
  }, [missingDependencyIds]);

  return { dependencyError, missingDependencyIds, retryDependencies };
}
