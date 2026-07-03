import { useState, useCallback, useEffect } from "react";
import { fetchWorkbooks, fetchWorkbook, uploadExcel, type WorkbookFull } from "../../../api/workbooks";

export function useWorkbookCatalog() {
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
    fetchWorkbooks()
      .then((list) => {
        const safeList = Array.isArray(list) ? list : [];
        setWorkbooks(safeList);
        if (safeList.length > 0) return fetchWorkbook(safeList[0].id);
        return null;
      })
      .then((wb) => {
        replaceCurrentWorkbook(wb);
        setLoading(false);
      })
      .catch(() => {
        setWorkbooks([]);
        replaceCurrentWorkbook(null);
        setStatus("加载失败");
        setLoading(false);
      });
  }, [replaceCurrentWorkbook]);

  const switchWorkbook = useCallback(async (idx: number) => {
    setWorkbookIdx(idx);
    const wb = workbooks[idx];
    if (!wb) return;
    const full = await fetchWorkbook(wb.id);
    replaceCurrentWorkbook(full);
  }, [replaceCurrentWorkbook, workbooks]);

  const handleUpload = useCallback(async (file: File) => {
    if (!currentWorkbook) return;
    setStatus("导入中...");
    try {
      await uploadExcel(currentWorkbook.id, file);
      const refreshed = await fetchWorkbook(currentWorkbook.id);
      replaceCurrentWorkbook(refreshed);
      setStatus("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "导入失败";
      setStatus(`导入失败：${message}`);
    }
  }, [currentWorkbook, replaceCurrentWorkbook]);

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
