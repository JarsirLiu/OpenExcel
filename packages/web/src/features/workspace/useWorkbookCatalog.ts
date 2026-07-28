import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createWorkbook,
  deleteWorkbook,
  fetchWorkbooks,
  importWorkbooks,
  updateWorkbookName,
  type WorkbookFull,
  type WorkbookMeta,
} from "@/api/workbooks";
import { sortWorkbooks } from "./workbookOrdering";

const STORAGE_KEY_IDX = "openexcel:workbookIdx";

function storageKey(workspaceId: number | null): string | null {
  return workspaceId == null ? null : `${STORAGE_KEY_IDX}:${workspaceId}`;
}

function loadStoredIdx(workspaceId: number | null): number {
  const key = storageKey(workspaceId);
  if (!key) return 0;
  try {
    const stored = sessionStorage.getItem(key);
    return stored !== null ? Math.max(0, Number(stored)) : 0;
  } catch {
    return 0;
  }
}

function saveIdx(workspaceId: number | null, idx: number) {
  const key = storageKey(workspaceId);
  if (!key) return;
  try {
    sessionStorage.setItem(key, String(idx));
  } catch {}
}

export type WorkbookInitial = {
  workspaceId: number;
  workbooks: WorkbookMeta[];
  currentWorkbook: WorkbookFull | null;
};

export type WorkbookTransition = {
  targetWorkbookId: number;
  status: "loading" | "failed";
  error?: string;
};

type CatalogMutationResult<T> = {
  result: T;
  workbooks: WorkbookMeta[];
};

type CatalogImportResult = {
  results: { id: number; publicId: string; name: string; sheets: number }[];
  completedFiles: number;
  activeFileName: string;
  workbooks: WorkbookMeta[];
  error: unknown | null;
};

export function useWorkbookCatalog(workspaceId: number | null, initial?: WorkbookInitial) {
  const [workbooks, setWorkbooks] = useState<WorkbookMeta[]>(initial?.workbooks ?? []);
  const [activeWorkbookId, setActiveWorkbookId] = useState<number | null>(
    initial?.currentWorkbook?.id ?? null,
  );
  const [loading, setLoading] = useState(!initial);
  const [transition, setTransition] = useState<WorkbookTransition | null>(null);
  const workspaceCatalogReadyRef = useRef(initial?.workspaceId === workspaceId);
  const requestGenerationRef = useRef(0);

  const invalidateRequests = useCallback(() => {
    requestGenerationRef.current += 1;
    return requestGenerationRef.current;
  }, []);

  useEffect(() => {
    const generation = invalidateRequests();
    const controller = new AbortController();
    requestGenerationRef.current = generation;
    workspaceCatalogReadyRef.current = false;

    if (workspaceId == null) {
      setWorkbooks([]);
      setActiveWorkbookId(null);
      setTransition(null);
      setLoading(false);
      return () => controller.abort();
    }

    if (initial?.workspaceId === workspaceId) {
      workspaceCatalogReadyRef.current = true;
      const safeList = sortWorkbooks(initial.workbooks);
      setWorkbooks(safeList);
      const initialWorkbookIdx = initial.currentWorkbook
        ? safeList.findIndex((workbook) => workbook.id === initial.currentWorkbook?.id)
        : loadStoredIdx(workspaceId);
      const idx = Math.min(initialWorkbookIdx >= 0 ? initialWorkbookIdx : 0, safeList.length - 1);
      const nextId = safeList[idx >= 0 ? idx : 0]?.id ?? null;
      setActiveWorkbookId(nextId);
      if (initial.currentWorkbook == null && nextId != null) {
        setTransition({ targetWorkbookId: nextId, status: "loading" });
      } else {
        setTransition(null);
      }
      setLoading(safeList.length > 0 && initial.currentWorkbook == null);
      return () => controller.abort();
    }

    refreshWorkspaceCatalog();

    async function refreshWorkspaceCatalog() {
      setWorkbooks([]);
      setTransition(null);
      setActiveWorkbookId(null);
      setLoading(workspaceId != null);
      if (workspaceId == null) return;

      try {
        const list = await fetchWorkbooks(workspaceId, { signal: controller.signal });
        if (controller.signal.aborted || generation !== requestGenerationRef.current) return;
        const safeList = Array.isArray(list) ? sortWorkbooks(list) : [];
        workspaceCatalogReadyRef.current = true;
        setWorkbooks(safeList);
        const storedIdx = Math.min(loadStoredIdx(workspaceId), Math.max(0, safeList.length - 1));
        const nextId = safeList[storedIdx]?.id ?? null;
        setActiveWorkbookId(nextId);
        if (nextId != null) {
          setTransition({ targetWorkbookId: nextId, status: "loading" });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("[workbook] Failed to load workspace catalog:", error);
        }
      } finally {
        if (!controller.signal.aborted && generation === requestGenerationRef.current) {
          setLoading(false);
        }
      }
    }

    return () => controller.abort();
  }, [initial, invalidateRequests, workspaceId]);

  const commitWorkbook = useCallback(
    (workbookId: number) => {
      if (!workbooks.some((workbook) => workbook.id === workbookId)) return;
      setActiveWorkbookId(workbookId);
      setTransition(null);
      setLoading(false);
    },
    [workbooks],
  );

  const failWorkbookTransition = useCallback((error: unknown) => {
    setTransition((current) =>
      current
        ? {
            ...current,
            status: "failed",
            error: error instanceof Error ? error.message : "加载工作簿失败",
          }
        : current,
    );
  }, []);

  const clearActiveWorkbook = useCallback(() => {
    setActiveWorkbookId(null);
    setTransition(null);
    setLoading(false);
  }, []);

  const refreshCatalog = useCallback(async (): Promise<WorkbookMeta[] | null> => {
    if (workspaceId == null) return null;

    const generation = invalidateRequests();
    const controller = new AbortController();
    try {
      const list = await fetchWorkbooks(workspaceId, { signal: controller.signal });
      if (controller.signal.aborted || generation !== requestGenerationRef.current) return null;
      const safeList = Array.isArray(list) ? sortWorkbooks(list) : [];
      setWorkbooks(safeList);
      workspaceCatalogReadyRef.current = true;
      return safeList;
    } catch (error) {
      if (!controller.signal.aborted && generation === requestGenerationRef.current) {
        console.error("[workbook] Failed to refresh workspace catalog:", error);
      }
      return null;
    }
  }, [invalidateRequests, workspaceId]);

  const runCatalogMutation = useCallback(
    async <T>(
      operation: (signal: AbortSignal) => Promise<T>,
    ): Promise<CatalogMutationResult<T> | null> => {
      if (workspaceId == null) return null;

      const generation = invalidateRequests();
      const controller = new AbortController();
      try {
        const result = await operation(controller.signal);
        const list = await fetchWorkbooks(workspaceId, { signal: controller.signal });
        if (controller.signal.aborted || generation !== requestGenerationRef.current) return null;
        const safeList = Array.isArray(list) ? sortWorkbooks(list) : [];
        setWorkbooks(safeList);
        workspaceCatalogReadyRef.current = true;
        return { result, workbooks: safeList };
      } catch (error) {
        if (controller.signal.aborted || generation !== requestGenerationRef.current) return null;
        throw error;
      }
    },
    [invalidateRequests, workspaceId],
  );

  const createWorkbookInCatalog = useCallback(
    (input?: { name?: string; sheetName?: string; sourceSheetId?: number }) => {
      if (workspaceId == null) return Promise.resolve(null);
      return runCatalogMutation((signal) => createWorkbook(workspaceId, input, { signal }));
    },
    [runCatalogMutation, workspaceId],
  );

  const deleteWorkbookInCatalog = useCallback(
    (workbookId: number) => {
      if (workspaceId == null) return Promise.resolve(null);
      return runCatalogMutation((signal) => deleteWorkbook(workspaceId, workbookId, { signal }));
    },
    [runCatalogMutation, workspaceId],
  );

  const renameWorkbookInCatalog = useCallback(
    (workbookId: number, name: string) => {
      if (workspaceId == null) return Promise.resolve(null);
      return runCatalogMutation((signal) =>
        updateWorkbookName(workspaceId, workbookId, name, { signal }),
      );
    },
    [runCatalogMutation, workspaceId],
  );

  const importWorkbooksInCatalog = useCallback(
    async (files: File[]): Promise<CatalogImportResult | null> => {
      if (workspaceId == null) return null;

      const generation = invalidateRequests();
      const controller = new AbortController();
      const results: CatalogImportResult["results"] = [];
      let completedFiles = 0;
      let activeFileName = "";
      let error: unknown | null = null;

      for (const file of files) {
        activeFileName = file.name;
        try {
          results.push(
            ...(await importWorkbooks(workspaceId, file, { signal: controller.signal })),
          );
          completedFiles += 1;
        } catch (cause) {
          error = cause;
          break;
        }
      }

      if (controller.signal.aborted || generation !== requestGenerationRef.current) return null;

      const list = await fetchWorkbooks(workspaceId, { signal: controller.signal });
      if (controller.signal.aborted || generation !== requestGenerationRef.current) return null;
      const safeList = Array.isArray(list) ? sortWorkbooks(list) : [];
      setWorkbooks(safeList);
      workspaceCatalogReadyRef.current = true;
      return { results, completedFiles, activeFileName, workbooks: safeList, error };
    },
    [invalidateRequests, workspaceId],
  );

  useEffect(() => {
    const activeIdx = workbooks.findIndex((workbook) => workbook.id === activeWorkbookId);
    if (activeIdx >= 0) saveIdx(workspaceId, activeIdx);
  }, [activeWorkbookId, workbooks, workspaceId]);

  const switchWorkbook = useCallback(
    async (idx: number) => {
      const target = workbooks[idx];
      if (!target || target.id === activeWorkbookId) return;
      setTransition({ targetWorkbookId: target.id, status: "loading" });
    },
    [activeWorkbookId, workbooks],
  );

  const requestWorkbookById = useCallback(
    (workbookId: number) => {
      if (workbookId === activeWorkbookId) return;
      setTransition({ targetWorkbookId: workbookId, status: "loading" });
    },
    [activeWorkbookId],
  );

  const workbookIdx = useMemo(() => {
    const index = workbooks.findIndex((workbook) => workbook.id === activeWorkbookId);
    return index >= 0 ? index : 0;
  }, [activeWorkbookId, workbooks]);

  const retryTransition = useCallback(() => {
    if (!transition) return;
    const idx = workbooks.findIndex((workbook) => workbook.id === transition.targetWorkbookId);
    if (idx < 0) return;
    setTransition({ targetWorkbookId: transition.targetWorkbookId, status: "loading" });
  }, [transition, workbooks]);

  return {
    workbooks,
    workbookIdx,
    activeWorkbookId,
    requestWorkbookById,
    commitWorkbook,
    failWorkbookTransition,
    clearActiveWorkbook,
    refreshCatalog,
    createWorkbookInCatalog,
    deleteWorkbookInCatalog,
    renameWorkbookInCatalog,
    importWorkbooksInCatalog,
    loading,
    transition,
    retryTransition,
    switchWorkbook,
  };
}
