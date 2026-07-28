import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSheet, fetchWorkbookForEditor, type WorkbookFull } from "@/api/workbooks";
import { mergeWorkbookSnapshot } from "@/features/sync/workbookRevision";

function loadedSheetIds(workbook: WorkbookFull | null): number[] | undefined {
  if (!workbook) return undefined;
  const ids = workbook.sheets.filter((sheet) => sheet.loaded !== false).map((sheet) => sheet.id);
  return ids.length > 0 ? ids : undefined;
}

export type WorkbookUpdater = (workbook: WorkbookFull) => WorkbookFull;

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; message?: unknown };
  return (
    candidate.name === "AbortError" ||
    (typeof candidate.message === "string" && candidate.message.toLowerCase().includes("aborted"))
  );
}

export function useWorkbookDocument(
  workspaceId: number | null,
  initialWorkbook: WorkbookFull | null | undefined,
) {
  const [currentWorkbook, setCurrentWorkbook] = useState<WorkbookFull | null>(
    initialWorkbook ?? null,
  );
  const [workbookRevision, setWorkbookRevision] = useState(0);
  const currentWorkbookRef = useRef(currentWorkbook);
  const workbookRequestGenerationRef = useRef(0);
  const workbookRequestControllerRef = useRef<AbortController | null>(null);
  const sheetRequestGenerationRef = useRef(0);
  const sheetRequestControllerRef = useRef<AbortController | null>(null);

  const invalidateWorkbookRequests = useCallback(() => {
    workbookRequestGenerationRef.current += 1;
    workbookRequestControllerRef.current?.abort();
    workbookRequestControllerRef.current = null;
    return workbookRequestGenerationRef.current;
  }, []);

  const invalidateSheetRequests = useCallback(() => {
    sheetRequestGenerationRef.current += 1;
    sheetRequestControllerRef.current?.abort();
    sheetRequestControllerRef.current = null;
    return sheetRequestGenerationRef.current;
  }, []);

  const invalidateRequests = useCallback(() => {
    invalidateWorkbookRequests();
    invalidateSheetRequests();
  }, [invalidateSheetRequests, invalidateWorkbookRequests]);

  const beginWorkbookRequest = useCallback(() => {
    const generation = invalidateWorkbookRequests();
    // A workbook replacement invalidates any sheet request for the old document.
    invalidateSheetRequests();
    const controller = new AbortController();
    workbookRequestControllerRef.current = controller;
    return { generation, controller };
  }, [invalidateSheetRequests, invalidateWorkbookRequests]);

  const beginSheetRequest = useCallback(() => {
    const generation = invalidateSheetRequests();
    const controller = new AbortController();
    sheetRequestControllerRef.current = controller;
    return { generation, controller };
  }, [invalidateSheetRequests]);

  const isCurrentWorkbookRequest = useCallback((generation: number, signal: AbortSignal) => {
    return generation === workbookRequestGenerationRef.current && !signal.aborted;
  }, []);

  const isCurrentSheetRequest = useCallback((generation: number, signal: AbortSignal) => {
    return generation === sheetRequestGenerationRef.current && !signal.aborted;
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
      const { generation, controller } = beginWorkbookRequest();
      try {
        const next = await fetchWorkbookForEditor(workspaceId, workbookId, {
          signal: controller.signal,
          loadChartDependencies: options?.loadChartDependencies,
        });
        if (!isCurrentWorkbookRequest(generation, controller.signal)) return null;
        replaceCurrentWorkbook(next);
        return next;
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) return null;
        throw error;
      } finally {
        if (isCurrentWorkbookRequest(generation, controller.signal)) {
          workbookRequestControllerRef.current = null;
        }
      }
    },
    [beginWorkbookRequest, isCurrentWorkbookRequest, replaceCurrentWorkbook, workspaceId],
  );

  const reloadCurrentWorkbook = useCallback(
    async (options?: { sheetIds?: readonly number[] }) => {
      const current = currentWorkbookRef.current;
      if (workspaceId == null || current == null) return null;
      const { generation, controller } = beginWorkbookRequest();
      try {
        const next = await fetchWorkbookForEditor(workspaceId, current.id, {
          signal: controller.signal,
          sheetIds: options?.sheetIds ?? loadedSheetIds(current),
        });
        if (!isCurrentWorkbookRequest(generation, controller.signal)) return null;
        const merged = mergeWorkbookSnapshot(current, next);
        replaceCurrentWorkbook(merged);
        return merged;
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) return null;
        throw error;
      } finally {
        if (isCurrentWorkbookRequest(generation, controller.signal)) {
          workbookRequestControllerRef.current = null;
        }
      }
    },
    [beginWorkbookRequest, isCurrentWorkbookRequest, replaceCurrentWorkbook, workspaceId],
  );

  const loadSheet = useCallback(
    async (sheetId: number) => {
      if (workspaceId == null) return null;
      const current = currentWorkbookRef.current;
      if (!current?.sheets.some((sheet) => sheet.id === sheetId)) return null;
      const workbookId = current.id;
      const { generation, controller } = beginSheetRequest();
      try {
        const loaded = await fetchSheet(workspaceId, sheetId, { signal: controller.signal });
        if (
          !isCurrentSheetRequest(generation, controller.signal) ||
          currentWorkbookRef.current?.id !== workbookId
        ) {
          return null;
        }
        return updateCurrentWorkbook((latest) => ({
          ...latest,
          sheets: latest.sheets.map((sheet) => (sheet.id === loaded.id ? loaded : sheet)),
        }));
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) return null;
        throw error;
      } finally {
        if (isCurrentSheetRequest(generation, controller.signal)) {
          sheetRequestControllerRef.current = null;
        }
      }
    },
    [beginSheetRequest, isCurrentSheetRequest, updateCurrentWorkbook, workspaceId],
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
