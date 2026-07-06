import { useCallback, useEffect, useState } from "react";
import type { SheetChangeDelta } from "@openexcel/core";
import {
  deleteWorkbook,
  fetchWorkbook,
  fetchWorkbooks,
  uploadNewWorkbook,
} from "@/api/workbooks";
import type { WorkbookMeta } from "@/api/workbooks";
import { patchWorkbookWithDelta } from "../utils/patchWorkbook";
import { useWorkbookImportFlow } from "../import/useWorkbookImportFlow";
import { useWorkbookCatalog } from "./useWorkbookCatalog";
import type { WorkbookStructureUpdate } from "@/features/chat/hooks/useSheetPatchSync";

function sortWorkbooks(list: WorkbookMeta[]): WorkbookMeta[] {
  return [...list].sort((a, b) => a.order - b.order || a.id - b.id);
}

const SHEET_STORAGE_KEY = "openexcel:sheetIdx";

function loadStoredSheetIdx(): number {
  try {
    const stored = sessionStorage.getItem(SHEET_STORAGE_KEY);
    return stored !== null ? Math.max(0, Number(stored)) : 0;
  } catch {
    return 0;
  }
}

export function useWorkbookWorkspace(workspaceId: number | null) {
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
  } = useWorkbookCatalog(workspaceId);

  const [currentSheetIndex, setCurrentSheetIndex] = useState(loadStoredSheetIdx);
  const [referenceCacheRevision, setReferenceCacheRevision] = useState(0);

  const invalidateReferenceCache = useCallback(() => {
    setReferenceCacheRevision((revision) => revision + 1);
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(SHEET_STORAGE_KEY, String(currentSheetIndex));
    } catch {
      // ignore
    }
  }, [currentSheetIndex]);

  const refreshCurrentWorkbook = useCallback(async () => {
    if (!currentWorkbook || workspaceId == null) return;
    try {
      const full = await fetchWorkbook(workspaceId, currentWorkbook.id);
      replaceCurrentWorkbook(full);
    } catch {
      // ignore
    }
  }, [currentWorkbook, replaceCurrentWorkbook, workspaceId]);

  const handleSheetChanged = useCallback(async (sheetId: number, delta: SheetChangeDelta | null) => {
    if (!currentWorkbook || workspaceId == null) return;
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
      const full = await fetchWorkbook(workspaceId, currentWorkbook.id);
      replaceCurrentWorkbook(full);
    } catch {
      // ignore
    }
  }, [currentWorkbook, replaceCurrentWorkbook, workspaceId]);

  const handleWorkbookStructureChanged = useCallback(async (update: WorkbookStructureUpdate) => {
    if (workspaceId == null) return;
    invalidateReferenceCache();

    if (update.kind === "workbook-created") {
      const list = await fetchWorkbooks(workspaceId);
      const safeList = Array.isArray(list) ? sortWorkbooks(list) : [];
      setWorkbooks(safeList);

      const nextWorkbook = await fetchWorkbook(workspaceId, update.workbookId);

      replaceCurrentWorkbook(nextWorkbook);
      const nextIndex = safeList.findIndex((wb) => wb.id === update.workbookId);
      setWorkbookIdx(nextIndex >= 0 ? nextIndex : 0);
      setCurrentSheetIndex(0);
      return;
    }

    if (update.kind === "sheet-deleted") {
      if (currentWorkbook?.id !== update.workbookId) {
        return;
      }

      const nextWorkbook = await fetchWorkbook(workspaceId, update.workbookId);
      replaceCurrentWorkbook(nextWorkbook);
      const nextIndex = nextWorkbook.sheets.findIndex((sheet) => sheet.id === update.sheetId);
      const fallbackIndex = Math.min(update.order, nextWorkbook.sheets.length - 1);
      setCurrentSheetIndex(nextIndex >= 0 ? nextIndex : fallbackIndex);
      return;
    }

    if (currentWorkbook?.id !== update.workbookId) {
      return;
    }

    const nextWorkbook = await fetchWorkbook(workspaceId, update.workbookId);
    replaceCurrentWorkbook(nextWorkbook);
    const nextIndex = nextWorkbook.sheets.findIndex((sheet) => sheet.id === update.sheetId);
    setCurrentSheetIndex(nextIndex >= 0 ? nextIndex : Math.min(update.order, nextWorkbook.sheets.length - 1));
  }, [currentWorkbook?.id, invalidateReferenceCache, replaceCurrentWorkbook, setCurrentSheetIndex, setWorkbookIdx, setWorkbooks, workspaceId]);

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
    if (workspaceId == null) return;
    setStatus("上传中...");
    try {
      const result = await uploadNewWorkbook(workspaceId, file);
      const list = await fetchWorkbooks(workspaceId);
      const safeList = Array.isArray(list) ? sortWorkbooks(list) : [];
      setWorkbooks(safeList);
      invalidateReferenceCache();
      const idx = safeList.findIndex((wb) => wb.id === result.id);
      if (idx >= 0) {
        setWorkbookIdx(idx);
        const full = await fetchWorkbook(workspaceId, result.id);
        replaceCurrentWorkbook(full);
        setCurrentSheetIndex(0);
      }
      setStatus("上传完成");
    } catch (error) {
      const message = error instanceof Error ? error.message : "上传失败";
      setStatus(`上传失败：${message}`);
    }
  }, [invalidateReferenceCache, replaceCurrentWorkbook, setStatus, setWorkbooks, setWorkbookIdx, workspaceId]);

  const handleWorkbookDelete = useCallback(async (workbookId: number) => {
    if (workspaceId == null) return;
    await deleteWorkbook(workspaceId, workbookId);
    const list = await fetchWorkbooks(workspaceId);
    const safeList = Array.isArray(list) ? sortWorkbooks(list) : [];
    setWorkbooks(safeList);
    invalidateReferenceCache();
    const remaining = safeList.filter((wb) => wb.id !== workbookId);
    if (remaining.length > 0) {
      setWorkbookIdx(0);
      const full = await fetchWorkbook(workspaceId, remaining[0].id);
      replaceCurrentWorkbook(full);
      setCurrentSheetIndex(0);
    } else {
      setWorkbookIdx(0);
      replaceCurrentWorkbook(null);
    }
    setStatus("已删除");
  }, [invalidateReferenceCache, replaceCurrentWorkbook, setStatus, setWorkbooks, setWorkbookIdx, workspaceId]);

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
    setCurrentSheetIndex,
    setImportSheetIndex,
    handleSheetChanged,
    handleWorkbookStructureChanged,
    handleWorkbookRefresh: refreshCurrentWorkbook,
    handleSwitchWorkbook,
    handleUploadFileChange,
    handleImportConfirm,
    handleImportCancel,
    handleNewWorkbookFileChange,
    handleWorkbookDelete,
    referenceCacheRevision,
  };
}
