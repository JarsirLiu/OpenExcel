import { useState, useCallback, useEffect } from "react";
import { fetchWorkbooks, fetchWorkbook, uploadExcel, downloadTemplateUrl } from "../api/client";
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
        setWorkbooks(list);
        if (list.length > 0) return fetchWorkbook(list[0].id);
        return null;
      })
      .then((wb) => {
        setCurrentWorkbook(wb);
        setLoading(false);
      })
      .catch(() => setLoading(false));
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
    setStatus("解析中...");
    try {
      await uploadExcel(currentWorkbook.id, file);
      const refreshed = await fetchWorkbook(currentWorkbook.id);
      setCurrentWorkbook(refreshed);
      setStatus("解析完成");
    } catch {
      setStatus("上传失败");
    }
  }, [currentWorkbook]);

  const downloadTemplate = useCallback(() => {
    if (!currentWorkbook) return;
    const a = document.createElement("a");
    a.href = downloadTemplateUrl(currentWorkbook.id);
    a.download = `${currentWorkbook.name}.xlsx`;
    a.click();
  }, [currentWorkbook]);

  const clearData = useCallback(() => {
    setStatus("");
  }, []);

  return {
    workbooks, workbookIdx, switchWorkbook,
    currentWorkbook, uploadExcel: handleUpload,
    downloadTemplate, status, clearData, loading,
  };
}
