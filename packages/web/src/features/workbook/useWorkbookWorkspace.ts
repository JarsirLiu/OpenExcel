import { useCallback, useState } from "react";
import type { SheetChangeDelta } from "@openexcel/core";
import {
  deleteWorkbook,
  fetchWorkbook,
  fetchWorkbooks,
  uploadNewWorkbook,
} from "../../api/client";
import { useWorkbench } from "../../hooks/useWorkbench";
import { patchWorkbookWithDelta } from "../../utils/patchWorkbook";
import { useWorkbookImportFlow } from "./useWorkbookImportFlow";
import { useWorkbookSheetSummaries } from "./useWorkbookSheetSummaries";

export function useWorkbookWorkspace() {
  const {
    workbooks,
    workbookIdx,
    switchWorkbook,
    currentWorkbook,
    status,
    loading,
    setWorkbooks,
    replaceCurrentWorkbook,
    setWorkbookIdx,
    setStatus,
    uploadExcel,
    workbookRevision,
  } = useWorkbench();

  const [currentSheetIndex, setCurrentSheetIndex] = useState(0);
  const allSheets = useWorkbookSheetSummaries(workbooks);

  const refreshCurrentWorkbook = useCallback(async () => {
    if (!currentWorkbook) return;
    try {
      const full = await fetchWorkbook(currentWorkbook.id);
      replaceCurrentWorkbook(full);
    } catch {
      // ignore
    }
  }, [currentWorkbook, replaceCurrentWorkbook]);

  const handleSheetChanged = useCallback(async (sheetId: number, delta: SheetChangeDelta | null) => {
    if (!currentWorkbook) return;
    const hasSheet = currentWorkbook.sheets.some((sheet) => sheet.id === sheetId);
    if (!hasSheet) return;

    if (delta) {
      const patched = patchWorkbookWithDelta(currentWorkbook, sheetId, delta);
      if (patched) {
        replaceCurrentWorkbook(patched);
        return;
      }
    }

    try {
      const full = await fetchWorkbook(currentWorkbook.id);
      replaceCurrentWorkbook(full);
    } catch {
      // ignore
    }
  }, [currentWorkbook, replaceCurrentWorkbook]);

  const handleSwitchWorkbook = useCallback(async (index: number) => {
    await switchWorkbook(index);
    setCurrentSheetIndex(0);
  }, [switchWorkbook]);

  const {
    importPreview,
    importSheetIndex,
    importing,
    setImportSheetIndex,
    handleUploadFileChange,
    handleImportConfirm,
    handleImportCancel,
  } = useWorkbookImportFlow({
    currentWorkbook,
    setStatus,
    uploadExcel,
  });

  const handleNewWorkbookFileChange = useCallback(async (file: File) => {
    setStatus("上传中...");
    try {
      const result = await uploadNewWorkbook(file);
      const list = await fetchWorkbooks();
      setWorkbooks(Array.isArray(list) ? list : []);
      const idx = (Array.isArray(list) ? list : []).findIndex((wb) => wb.id === result.id);
      if (idx >= 0) {
        setWorkbookIdx(idx);
        const full = await fetchWorkbook(result.id);
        replaceCurrentWorkbook(full);
        setCurrentSheetIndex(0);
      }
      setStatus("上传完成");
    } catch (error) {
      const message = error instanceof Error ? error.message : "上传失败";
      setStatus(`上传失败：${message}`);
    }
  }, [replaceCurrentWorkbook, setStatus, setWorkbooks, setWorkbookIdx]);

  const handleWorkbookDelete = useCallback(async (workbookId: number) => {
    await deleteWorkbook(workbookId);
    const list = await fetchWorkbooks();
    setWorkbooks(Array.isArray(list) ? list : []);
    const remaining = (Array.isArray(list) ? list : []).filter((wb) => wb.id !== workbookId);
    if (remaining.length > 0) {
      setWorkbookIdx(0);
      const full = await fetchWorkbook(remaining[0].id);
      replaceCurrentWorkbook(full);
      setCurrentSheetIndex(0);
    } else {
      setWorkbookIdx(0);
      replaceCurrentWorkbook(null);
    }
    setStatus("已删除");
  }, [replaceCurrentWorkbook, setStatus, setWorkbooks, setWorkbookIdx]);

  return {
    workbooks,
    workbookIdx,
    currentWorkbook,
    workbookRevision,
    status,
    loading,
    currentSheetIndex,
    importPreview,
    importSheetIndex,
    importing,
    allSheets,
    setCurrentSheetIndex,
    setImportSheetIndex,
    handleSheetChanged,
    handleWorkbookRefresh: refreshCurrentWorkbook,
    handleSwitchWorkbook,
    handleUploadFileChange,
    handleImportConfirm,
    handleImportCancel,
    handleNewWorkbookFileChange,
    handleWorkbookDelete,
  };
}
