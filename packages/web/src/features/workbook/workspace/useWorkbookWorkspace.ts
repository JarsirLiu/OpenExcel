import { useCallback, useState } from "react";
import type { SheetChangeDelta } from "@openexcel/core";
import {
  deleteWorkbook,
  fetchWorkbook,
  fetchWorkbooks,
  uploadNewWorkbook,
} from "../../../api/workbooks";
import type { WorkbookFull, WorkbookMeta, SheetSchema } from "../../../api/workbooks";
import { patchWorkbookWithDelta } from "../utils/patchWorkbook";
import { useWorkbookImportFlow } from "../import/useWorkbookImportFlow";
import { useWorkbookSheetSummaries } from "./useWorkbookSheetSummaries";
import { useWorkbookCatalog } from "./useWorkbookCatalog";
import type { WorkbookCreatedUpdate, WorkbookStructureUpdate } from "../../chat/hooks/useSheetPatchSync";

function buildBlankSheetSchema(id: number, name: string, order: number): SheetSchema {
  return {
    id,
    name,
    order,
    columns: [{ label: "A" }],
    merges: [],
    uploadedData: [],
    config: null,
  };
}

function buildBlankWorkbook(update: WorkbookCreatedUpdate): WorkbookFull {
  return {
    id: update.workbookId,
    name: update.workbookName,
    sheets: [buildBlankSheetSchema(update.initialSheet.id, update.initialSheet.name, update.initialSheet.order)],
  };
}

function sortWorkbooks(list: WorkbookMeta[]): WorkbookMeta[] {
  return [...list].sort((a, b) => a.order - b.order || a.id - b.id);
}

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
  } = useWorkbookCatalog();

  const [currentSheetIndex, setCurrentSheetIndex] = useState(0);
  const [sheetSummaryRevision, setSheetSummaryRevision] = useState(0);
  const allSheets = useWorkbookSheetSummaries(sheetSummaryRevision);

  const refreshSheetSummaries = useCallback(() => {
    setSheetSummaryRevision((revision) => revision + 1);
  }, []);

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

  const handleWorkbookStructureChanged = useCallback(async (update: WorkbookStructureUpdate) => {
    refreshSheetSummaries();

    if (update.kind === "workbook-created") {
      const list = await fetchWorkbooks();
      const safeList = Array.isArray(list) ? sortWorkbooks(list) : [];
      setWorkbooks(safeList);

      const nextWorkbook = update.sourceSheetId == null
        ? buildBlankWorkbook(update)
        : await fetchWorkbook(update.workbookId);

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

      const nextWorkbook = await fetchWorkbook(update.workbookId);
      replaceCurrentWorkbook(nextWorkbook);
      const nextIndex = nextWorkbook.sheets.findIndex((sheet) => sheet.id === update.sheetId);
      const fallbackIndex = Math.min(update.order, nextWorkbook.sheets.length - 1);
      setCurrentSheetIndex(nextIndex >= 0 ? nextIndex : fallbackIndex);
      return;
    }

    if (currentWorkbook?.id !== update.workbookId) {
      return;
    }

    const nextWorkbook = await fetchWorkbook(update.workbookId);
    replaceCurrentWorkbook(nextWorkbook);
    const nextIndex = nextWorkbook.sheets.findIndex((sheet) => sheet.id === update.sheetId);
    setCurrentSheetIndex(nextIndex >= 0 ? nextIndex : Math.min(update.order, nextWorkbook.sheets.length - 1));
  }, [currentWorkbook?.id, refreshSheetSummaries, replaceCurrentWorkbook, setCurrentSheetIndex, setWorkbookIdx, setWorkbooks]);

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
      const safeList = Array.isArray(list) ? sortWorkbooks(list) : [];
      setWorkbooks(safeList);
      refreshSheetSummaries();
      const idx = safeList.findIndex((wb) => wb.id === result.id);
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
  }, [refreshSheetSummaries, replaceCurrentWorkbook, setStatus, setWorkbooks, setWorkbookIdx]);

  const handleWorkbookDelete = useCallback(async (workbookId: number) => {
    await deleteWorkbook(workbookId);
    const list = await fetchWorkbooks();
    const safeList = Array.isArray(list) ? sortWorkbooks(list) : [];
    setWorkbooks(safeList);
    refreshSheetSummaries();
    const remaining = safeList.filter((wb) => wb.id !== workbookId);
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
  }, [refreshSheetSummaries, replaceCurrentWorkbook, setStatus, setWorkbooks, setWorkbookIdx]);

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
    handleWorkbookStructureChanged,
    handleWorkbookRefresh: refreshCurrentWorkbook,
    handleSwitchWorkbook,
    handleUploadFileChange,
    handleImportConfirm,
    handleImportCancel,
    handleNewWorkbookFileChange,
    handleWorkbookDelete,
  };
}
