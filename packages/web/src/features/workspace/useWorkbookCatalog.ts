import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchWorkbook,
  fetchWorkbooks,
  type WorkbookFull,
  type WorkbookMeta,
} from "@/api/workbooks";
import { sortWorkbooks } from "./workbookOrdering";

const STORAGE_KEY_IDX = "openexcel:workbookIdx";

function loadStoredIdx(): number {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY_IDX);
    return stored !== null ? Math.max(0, Number(stored)) : 0;
  } catch {
    return 0;
  }
}

function saveIdx(idx: number) {
  try {
    sessionStorage.setItem(STORAGE_KEY_IDX, String(idx));
  } catch {}
}

export type WorkbookInitial = {
  workspaceId: number;
  workbooks: WorkbookMeta[];
  currentWorkbook: WorkbookFull | null;
};

export function useWorkbookCatalog(workspaceId: number | null, initial?: WorkbookInitial) {
  const [workbooks, setWorkbooks] = useState<WorkbookMeta[]>(initial?.workbooks ?? []);
  const [workbookIdx, setWorkbookIdx] = useState(loadStoredIdx);
  const [currentWorkbook, setCurrentWorkbook] = useState<WorkbookFull | null>(
    initial?.currentWorkbook ?? null,
  );
  const [workbookRevision, setWorkbookRevision] = useState(0);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(!initial);
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
      setWorkbookIdx(0);
      setCurrentWorkbook(null);
      setStatus("");
      setLoading(false);
      return () => controller.abort();
    }

    if (initial?.workspaceId === workspaceId) {
      workspaceCatalogReadyRef.current = true;
      const safeList = sortWorkbooks(initial.workbooks);
      setWorkbooks(safeList);
      const idx = Math.min(loadStoredIdx(), safeList.length - 1);
      setWorkbookIdx(idx >= 0 ? idx : 0);
      setCurrentWorkbook(initial.currentWorkbook);
      setLoading(safeList.length > 0 && initial.currentWorkbook == null);
      return () => controller.abort();
    }

    refreshWorkspaceCatalog();

    async function refreshWorkspaceCatalog() {
      setWorkbooks([]);
      setCurrentWorkbook(null);
      setWorkbookIdx(0);
      setStatus("");
      setLoading(workspaceId != null);
      if (workspaceId == null) return;

      try {
        const list = await fetchWorkbooks(workspaceId, { signal: controller.signal });
        if (controller.signal.aborted || generation !== requestGenerationRef.current) return;
        const safeList = Array.isArray(list) ? sortWorkbooks(list) : [];
        workspaceCatalogReadyRef.current = true;
        setWorkbooks(safeList);
        setWorkbookIdx(Math.min(loadStoredIdx(), Math.max(0, safeList.length - 1)));
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

  useEffect(() => {
    if (!workspaceCatalogReadyRef.current) return;
    if (workspaceId == null || workbooks.length === 0) return;
    const wb = workbooks[workbookIdx];
    if (!wb) return;
    if (currentWorkbook?.id === wb.id) {
      setLoading(false);
      return;
    }
    const generation = invalidateRequests();
    const controller = new AbortController();
    setLoading(true);
    fetchWorkbook(workspaceId, wb.id, { signal: controller.signal })
      .then((full) => {
        if (generation !== requestGenerationRef.current || controller.signal.aborted) return;
        setCurrentWorkbook(full);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || generation !== requestGenerationRef.current) return;
        console.error("[workbook] Failed to load workbook:", error);
        setLoading(false);
      });

    return () => {
      controller.abort();
      invalidateRequests();
    };
  }, [invalidateRequests, workspaceId, workbookIdx, workbooks, currentWorkbook?.id]);

  const replaceCurrentWorkbook = useCallback((next: WorkbookFull | null) => {
    setCurrentWorkbook(next);
    setWorkbookRevision((revision) => revision + 1);
  }, []);

  useEffect(() => {
    saveIdx(workbookIdx);
  }, [workbookIdx]);

  const switchWorkbook = useCallback(async (idx: number) => {
    setWorkbookIdx(idx);
  }, []);

  return {
    workbooks,
    setWorkbooks,
    workbookIdx,
    setWorkbookIdx,
    currentWorkbook,
    replaceCurrentWorkbook,
    workbookRevision,
    status,
    setStatus,
    loading,
    switchWorkbook,
  };
}
