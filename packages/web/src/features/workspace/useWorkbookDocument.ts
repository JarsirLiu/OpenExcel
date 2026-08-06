import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { fetchSheet, fetchWorkbookForEditor, type WorkbookFull } from "@/api/workbooks";
import type { SheetEditorChange } from "@/features/sync/sheetEditorChange";
import { WorkbookDocumentStore } from "./WorkbookDocumentStore";

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
  const documentStoreRef = useRef<WorkbookDocumentStore | null>(null);
  if (!documentStoreRef.current) {
    documentStoreRef.current = new WorkbookDocumentStore(initialWorkbook ?? null);
  }
  const documentStore = documentStoreRef.current;
  const subscribeToWorkbookChanges = useCallback(
    (listener: () => void) =>
      documentStore.subscribeToChanges((change) => {
        if (
          change.kind === "workbook" ||
          change.structural ||
          change.configChanged ||
          change.cells.length === 0
        ) {
          listener();
        }
      }),
    [documentStore],
  );
  const currentWorkbook = useSyncExternalStore(
    subscribeToWorkbookChanges,
    documentStore.getSnapshot,
    documentStore.getSnapshot,
  );
  const [workbookRevision, setWorkbookRevision] = useState(0);
  const currentWorkbookRef = useRef(documentStore.getSnapshot());
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
    invalidateRequests();
    const next = initialWorkbook ?? null;
    const replaced = documentStore.replace(next);
    currentWorkbookRef.current = replaced;
    setWorkbookRevision((revision) => revision + 1);

    return () => {
      invalidateRequests();
    };
  }, [documentStore, initialWorkbook?.id, invalidateRequests, workspaceId]);

  const replaceCurrentWorkbook = useCallback(
    (next: WorkbookFull | null) => {
      const replaced = documentStore.replace(next);
      currentWorkbookRef.current = replaced;
      setWorkbookRevision((revision) => revision + 1);
    },
    [documentStore],
  );

  const updateCurrentWorkbook = useCallback(
    (updater: WorkbookUpdater) => {
      const current = currentWorkbookRef.current;
      if (!current) return null;
      const next = documentStore.update(updater);
      currentWorkbookRef.current = next;
      setWorkbookRevision((revision) => revision + 1);
      return next;
    },
    [documentStore],
  );

  const updateCharts = useCallback(
    (charts: WorkbookFull["charts"]) => {
      const next = documentStore.updateCharts(charts);
      currentWorkbookRef.current = next;
    },
    [documentStore],
  );

  const updateSheetRevision = useCallback(
    (sheetId: number, revision: number, persistedThroughVersion?: number) => {
      const next = documentStore.updateSheetRevision(sheetId, revision, persistedThroughVersion);
      currentWorkbookRef.current = next;
    },
    [documentStore],
  );

  const updateSheetContent = useCallback(
    (change: SheetEditorChange): WorkbookFull | null => {
      const next = documentStore.updateSheetContent(change);
      currentWorkbookRef.current = next;
      return next;
    },
    [documentStore],
  );

  const applyCommittedSheetPatch = useCallback(
    (change: Extract<SheetEditorChange, { kind: "patch" }>, revision: number) => {
      const next = documentStore.applyCommittedSheetPatch(change, revision);
      currentWorkbookRef.current = next;
      return next;
    },
    [documentStore],
  );

  const updateWorkbookMetadata = useCallback(
    (updater: WorkbookUpdater) => {
      const next = documentStore.update(updater);
      currentWorkbookRef.current = next;
      return next;
    },
    [documentStore],
  );

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
    async (options?: { sheetIds?: readonly number[]; preserveEditorSession?: boolean }) => {
      const current = currentWorkbookRef.current;
      if (workspaceId == null || current == null) return null;
      const { generation, controller } = beginWorkbookRequest();
      try {
        const next = await fetchWorkbookForEditor(workspaceId, current.id, {
          signal: controller.signal,
          sheetIds: options?.sheetIds ?? loadedSheetIds(current),
        });
        if (!isCurrentWorkbookRequest(generation, controller.signal)) return null;
        const merged = documentStore.mergeRemoteSnapshot(next);
        currentWorkbookRef.current = merged;
        if (!options?.preserveEditorSession) {
          setWorkbookRevision((revision) => revision + 1);
        }
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
    [beginWorkbookRequest, documentStore, isCurrentWorkbookRequest, workspaceId],
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
        const merged = documentStore.mergeRemoteSheet(loaded);
        currentWorkbookRef.current = merged;
        setWorkbookRevision((revision) => revision + 1);
        return merged;
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) return null;
        throw error;
      } finally {
        if (isCurrentSheetRequest(generation, controller.signal)) {
          sheetRequestControllerRef.current = null;
        }
      }
    },
    [beginSheetRequest, currentWorkbookRef, documentStore, isCurrentSheetRequest, workspaceId],
  );

  return {
    currentWorkbook,
    currentWorkbookRef,
    workbookRevision,
    replaceCurrentWorkbook,
    updateCurrentWorkbook,
    updateCharts,
    updateSheetRevision,
    updateSheetContent,
    applyCommittedSheetPatch,
    updateWorkbookMetadata,
    loadWorkbook,
    reloadCurrentWorkbook,
    loadSheet,
    documentStore,
  };
}
