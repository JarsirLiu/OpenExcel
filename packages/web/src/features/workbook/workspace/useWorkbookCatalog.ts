import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWorkbooks, fetchWorkbook, uploadExcel, type WorkbookFull, type WorkbookMeta } from "@/api/workbooks";

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
  } catch {
    // ignore
  }
}

export function useWorkbookCatalog(workspaceId: number | null) {
  const [workbooks, setWorkbooks] = useState<WorkbookMeta[]>([]);
  const [workbookIdx, setWorkbookIdx] = useState(loadStoredIdx);
  const [currentWorkbook, setCurrentWorkbook] = useState<WorkbookFull | null>(null);
  const [workbookRevision, setWorkbookRevision] = useState(0);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const initialIdxRef = useRef(loadStoredIdx());

  const replaceCurrentWorkbook = useCallback((next: WorkbookFull | null) => {
    setCurrentWorkbook(next);
    setWorkbookRevision((revision) => revision + 1);
  }, []);

  useEffect(() => {
    if (workspaceId == null) {
      setWorkbooks([]);
      setWorkbookIdx(0);
      replaceCurrentWorkbook(null);
      setStatus("");
      setLoading(false);
      return;
    }

    setLoading(true);
    let cancelled = false;
    const intendedIdx = initialIdxRef.current;

    fetchWorkbooks(workspaceId)
      .then((list) => {
        if (cancelled) return;
        const safeList = Array.isArray(list) ? list : [];
        setWorkbooks(safeList);
        if (safeList.length > 0) {
          const targetIdx = Math.min(intendedIdx, safeList.length - 1);
          setWorkbookIdx(targetIdx);
          return fetchWorkbook(workspaceId, safeList[targetIdx].id);
        }
        return null;
      })
      .then((wb) => {
        if (cancelled) return;
        replaceCurrentWorkbook(wb ?? null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setWorkbooks([]);
        replaceCurrentWorkbook(null);
        setStatus(err instanceof Error ? err.message : "加载失败");
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [replaceCurrentWorkbook, workspaceId]);

  useEffect(() => {
    saveIdx(workbookIdx);
  }, [workbookIdx]);

  const switchWorkbook = useCallback(async (idx: number) => {
    setWorkbookIdx(idx);
    const wb = workbooks[idx];
    if (!wb || workspaceId == null) return;
    const full = await fetchWorkbook(workspaceId, wb.id);
    replaceCurrentWorkbook(full);
  }, [replaceCurrentWorkbook, workbooks, workspaceId]);

  const handleUpload = useCallback(async (file: File) => {
    if (!currentWorkbook || workspaceId == null) return;
    setStatus("导入中...");
    try {
      await uploadExcel(workspaceId, currentWorkbook.id, file);
      const refreshed = await fetchWorkbook(workspaceId, currentWorkbook.id);
      replaceCurrentWorkbook(refreshed);
      setStatus("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "导入失败";
      setStatus(`导入失败：${message}`);
    }
  }, [currentWorkbook, replaceCurrentWorkbook, workspaceId]);

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
    uploadExcel: handleUpload,
  };
}