import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWorkbook, uploadExcel, type WorkbookFull, type WorkbookMeta } from "@/api/workbooks";

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

type WorkbookInitial = {
  workbooks: WorkbookMeta[];
  currentWorkbook?: WorkbookFull | null;
};

export function useWorkbookCatalog(workspaceId: number | null, initial?: WorkbookInitial) {
  const [workbooks, setWorkbooks] = useState<WorkbookMeta[]>(initial?.workbooks ?? []);
  const [workbookIdx, setWorkbookIdx] = useState(loadStoredIdx);
  const [currentWorkbook, setCurrentWorkbook] = useState<WorkbookFull | null>(initial?.currentWorkbook ?? null);
  const [workbookRevision, setWorkbookRevision] = useState(0);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(!initial);

  useEffect(() => {
    if (!initial) return;
    setWorkbooks(initial.workbooks);
    const idx = Math.min(loadStoredIdx(), initial.workbooks.length - 1);
    setWorkbookIdx(idx >= 0 ? idx : 0);
    if (initial.currentWorkbook) {
      setCurrentWorkbook(initial.currentWorkbook);
    }
    setLoading(false);
  }, [initial]);

  useEffect(() => {
    if (workspaceId != null) return;
    setWorkbooks([]);
    setWorkbookIdx(0);
    setCurrentWorkbook(null);
    setStatus("");
    setLoading(false);
  }, [workspaceId]);

  const replaceCurrentWorkbook = useCallback((next: WorkbookFull | null) => {
    setCurrentWorkbook(next);
    setWorkbookRevision((revision) => revision + 1);
  }, []);

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