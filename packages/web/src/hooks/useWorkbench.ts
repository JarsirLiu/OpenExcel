import { useState, useCallback, useEffect } from "react";
import { fetchWorkbooks, fetchWorkbook, uploadExcel } from "../api/client";
import type { WorkbookFull } from "../api/client";

export function useWorkbench() {
  const [workbooks, setWorkbooks] = useState<{ id: number; name: string }[]>([]);
  const [workbookIdx, setWorkbookIdx] = useState(0);
  const [currentWorkbook, setCurrentWorkbook] = useState<WorkbookFull | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWorkbooks()
      .then((list) => {
        const safeList = Array.isArray(list) ? list : [];
        setWorkbooks(safeList);
        if (safeList.length > 0) return fetchWorkbook(safeList[0].id);
        return null;
      })
      .then((wb) => {
        setCurrentWorkbook(wb);
        setLoading(false);
      })
      .catch(() => {
        setWorkbooks([]);
        setCurrentWorkbook(null);
        setStatus("加载失败");
        setLoading(false);
      });
  }, []);

  const switchWorkbook = useCallback(async (idx: number) => {
    setWorkbookIdx(idx);
    const wb = workbooks[idx];
    if (!wb) return;
    const full = await fetchWorkbook(wb.id);
    setCurrentWorkbook(full);
  }, [workbooks]);

  const handleUpload = useCallback(async (file: File) => {
    if (!currentWorkbook) return;
    setStatus("导入中...");
    try {
      const result = await uploadExcel(currentWorkbook.id, file);
      const refreshed = await fetchWorkbook(currentWorkbook.id);
      setCurrentWorkbook(refreshed);
      setStatus(
        `导入完成：更新 ${result.updatedSheets.length} 张表，跳过 ${result.skippedCurrentSheets.length} 张当前表，忽略 ${result.ignoredUploadedSheets.length} 张文件表`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "导入失败";
      setStatus(`导入失败：${message}`);
    }
  }, [currentWorkbook]);

  return {
    workbooks, setWorkbooks,
    workbookIdx, setWorkbookIdx,
    currentWorkbook, setCurrentWorkbook,
    status, setStatus,
    loading,
    switchWorkbook,
    uploadExcel: handleUpload,
  };
}
