import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSheet, fetchWorkbookForEditor, type WorkbookFull } from "@/api/workbooks";
import { mergeWorkbookSnapshot } from "@/features/sync/workbookRevision";

function loadedSheetIds(workbook: WorkbookFull | null): number[] | undefined {
  if (!workbook) return undefined;
  const ids = workbook.sheets.filter((sheet) => sheet.loaded !== false).map((sheet) => sheet.id);
  return ids.length > 0 ? ids : undefined;
}

export type WorkbookUpdater = (workbook: WorkbookFull) => WorkbookFull;

export function useWorkbookDocument(
  workspaceId: number | null,
  initialWorkbook: WorkbookFull | null | undefined,
) {
  const [currentWorkbook, setCurrentWorkbook] = useState<WorkbookFull | null>(
    initialWorkbook ?? null,
  );
  const [workbookRevision, setWorkbookRevision] = useState(0);
  const currentWorkbookRef = useRef(currentWorkbook);
  const requestGenerationRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);

  const invalidateRequests = useCallback(() => {
    requestGenerationRef.current += 1;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    return requestGenerationRef.current;
  }, []);

  const beginRequest = useCallback(() => {
    const generation = invalidateRequests();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    return { generation, controller };
  }, [invalidateRequests]);

  const isCurrentRequest = useCallback((generation: number, signal: AbortSignal) => {
    return generation === requestGenerationRef.current && !signal.aborted;
  }, []);

  useEffect(() => {
    currentWorkbookRef.current = currentWorkbook;
  }, [currentWorkbook]);

  useEffect(() => {
    invalidateRequests();
    const next = initialWorkbook ?? null;
    currentWorkbookRef.current = next;
    setCurrentWorkbook(next);
    setWorkbookRevision((revision) => revision + 1);

    return () => {
      invalidateRequests();
    };
  }, [initialWorkbook?.id, invalidateRequests, workspaceId]);

  const replaceCurrentWorkbook = useCallback((next: WorkbookFull | null) => {
    currentWorkbookRef.current = next;
    setCurrentWorkbook(next);
    setWorkbookRevision((revision) => revision + 1);
  }, []);

  const updateCurrentWorkbook = useCallback(
    (updater: WorkbookUpdater) => {
      const current = currentWorkbookRef.current;
      if (!current) return null;
      const next = updater(current);
      replaceCurrentWorkbook(next);
      return next;
    },
    [replaceCurrentWorkbook],
  );

  const updateCharts = useCallback((charts: WorkbookFull["charts"]) => {
    const current = currentWorkbookRef.current;
    if (!current) return;
    const next = { ...current, charts };
    currentWorkbookRef.current = next;
    setCurrentWorkbook(next);
  }, []);

  const updateSheetRevision = useCallback((sheetId: number, revision: number) => {
    const current = currentWorkbookRef.current;
    const sheet = current?.sheets.find((item) => item.id === sheetId);
    if (!current || !sheet || revision <= sheet.revision) return;
    const next = {
      ...current,
      sheets: current.sheets.map((item) => (item.id === sheetId ? { ...item, revision } : item)),
    };
    currentWorkbookRef.current = next;
  }, []);

  const updateWorkbookMetadata = useCallback((updater: WorkbookUpdater) => {
    const current = currentWorkbookRef.current;
    if (!current) return null;
    const next = updater(current);
    currentWorkbookRef.current = next;
    setCurrentWorkbook(next);
    return next;
  }, []);

  const loadWorkbook = useCallback(
    async (workbookId: number, options?: { loadChartDependencies?: boolean }) => {
      if (workspaceId == null) return null;
      const { generation, controller } = beginRequest();
      try {
        const next = await fetchWorkbookForEditor(workspaceId, workbookId, {
          signal: controller.signal,
          loadChartDependencies: options?.loadChartDependencies,
        });
        if (!isCurrentRequest(generation, controller.signal)) return null;
        replaceCurrentWorkbook(next);
        return next;
      } finally {
        if (isCurrentRequest(generation, controller.signal)) {
          requestControllerRef.current = null;
        }
      }
    },
    [beginRequest, isCurrentRequest, replaceCurrentWorkbook, workspaceId],
  );

  const reloadCurrentWorkbook = useCallback(
    async (options?: { sheetIds?: readonly number[] }) => {
      const current = currentWorkbookRef.current;
      if (workspaceId == null || current == null) return null;
      const { generation, controller } = beginRequest();
      try {
        const next = await fetchWorkbookForEditor(workspaceId, current.id, {
          signal: controller.signal,
          sheetIds: options?.sheetIds ?? loadedSheetIds(current),
        });
        if (!isCurrentRequest(generation, controller.signal)) return null;
        const merged = mergeWorkbookSnapshot(current, next);
        replaceCurrentWorkbook(merged);
        return merged;
      } finally {
        if (isCurrentRequest(generation, controller.signal)) {
          requestControllerRef.current = null;
        }
      }
    },
    [beginRequest, isCurrentRequest, replaceCurrentWorkbook, workspaceId],
  );

  const loadSheet = useCallback(
    async (sheetId: number) => {
      if (workspaceId == null) return null;
      const current = currentWorkbookRef.current;
      if (!current || !current.sheets.some((sheet) => sheet.id === sheetId)) return null;
      const workbookId = current.id;
      const { generation, controller } = beginRequest();
      try {
        const loaded = await fetchSheet(workspaceId, sheetId, { signal: controller.signal });
        if (
          !isCurrentRequest(generation, controller.signal) ||
          currentWorkbookRef.current?.id !== workbookId
        ) {
          return null;
        }
        return updateCurrentWorkbook((latest) => ({
          ...latest,
          sheets: latest.sheets.map((sheet) => (sheet.id === loaded.id ? loaded : sheet)),
        }));
      } finally {
        if (isCurrentRequest(generation, controller.signal)) {
          requestControllerRef.current = null;
        }
      }
    },
    [beginRequest, isCurrentRequest, updateCurrentWorkbook, workspaceId],
  );

  return {
    currentWorkbook,
    currentWorkbookRef,
    workbookRevision,
    replaceCurrentWorkbook,
    updateCurrentWorkbook,
    updateCharts,
    updateSheetRevision,
    updateWorkbookMetadata,
    loadWorkbook,
    reloadCurrentWorkbook,
    loadSheet,
  };
}
