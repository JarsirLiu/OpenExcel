import { useState, useCallback, useEffect } from "react";
import { fetchWorkbooks, fetchWorkbook, uploadExcel, type WorkbookFull } from "../../../api/workbooks";

export function useWorkbookCatalog(workspaceId: number | null) {
  const [workbooks, setWorkbooks] = useState<{ id: number; name: string }[]>([]);
  const [workbookIdx, setWorkbookIdx] = useState(0);
  const [currentWorkbook, setCurrentWorkbook] = useState<WorkbookFull | null>(null);
  const [workbookRevision, setWorkbookRevision] = useState(0);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

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

    fetchWorkbooks(workspaceId)
      .then((list) => {
        if (cancelled) return;
        const safeList = Array.isArray(list) ? list : [];
        setWorkbooks(safeList);
        if (safeList.length > 0) return fetchWorkbook(workspaceId, safeList[0].id);
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
