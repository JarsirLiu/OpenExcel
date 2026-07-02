import { useRef, useState, useCallback } from "react";
import type { SheetChangeDelta } from "@openexcel/core";
import { useWorkbench } from "../hooks/useWorkbench";
import { uploadNewWorkbook, deleteWorkbook, fetchWorkbooks, fetchWorkbook } from "../api/client";
import { WorkbenchHeader } from "./WorkbenchHeader";
import { ExcelWorkspace } from "./ExcelWorkspace";
import { ChatSidebar } from "./ChatSidebar";
import { patchWorkbookWithDelta } from "../utils/patchWorkbook";
import { buildWorkbookImportPreview } from "../utils/importPreview";
import { ImportPreviewDialog } from "./ImportPreviewDialog";

export function Workbench() {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const newWbInputRef = useRef<HTMLInputElement>(null);
  const {
    workbooks,
    workbookIdx,
    switchWorkbook,
    currentWorkbook,
    uploadExcel,
    status,
    loading,
    setWorkbooks,
    setCurrentWorkbook,
    setWorkbookIdx,
    setStatus,
  } = useWorkbench();

  const [currentSheetIndex, setCurrentSheetIndex] = useState(0);
  const [revision, setRevision] = useState(0);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<Awaited<ReturnType<typeof buildWorkbookImportPreview>> | null>(null);
  const [importSheetIndex, setImportSheetIndex] = useState(0);
  const [importing, setImporting] = useState(false);

  const handleSheetChanged = useCallback(async (sheetId: number, delta: SheetChangeDelta | null) => {
    if (!currentWorkbook) return;
    const hasSheet = currentWorkbook.sheets.some((s) => s.id === sheetId);
    if (!hasSheet) return;

    if (delta) {
      const patched = patchWorkbookWithDelta(currentWorkbook, sheetId, delta);
      if (patched) {
        setCurrentWorkbook(patched);
        setRevision((r) => r + 1);
        return;
      }
    }

    try {
      const full = await fetchWorkbook(currentWorkbook.id);
      setCurrentWorkbook(full);
      setRevision((r) => r + 1);
    } catch {
      // ignore
    }
  }, [currentWorkbook, setCurrentWorkbook]);

  const handleWorkbookRefresh = useCallback(async () => {
    if (!currentWorkbook) return;
    try {
      const full = await fetchWorkbook(currentWorkbook.id);
      setCurrentWorkbook(full);
      setRevision((r) => r + 1);
    } catch {
      // ignore
    }
  }, [currentWorkbook, setCurrentWorkbook]);

  const handleSwitchWorkbook = useCallback(async (index: number) => {
    await switchWorkbook(index);
    setCurrentSheetIndex(0);
    setRevision(0);
  }, [switchWorkbook]);

  const handleUploadFileChange = useCallback(async (file: File) => {
    if (!currentWorkbook) return;
    setStatus("生成导入预览...");
    try {
      const preview = await buildWorkbookImportPreview(currentWorkbook, file);
      setPendingImportFile(file);
      setImportPreview(preview);
      const initialIndex = preview.sheets.findIndex((sheet) => sheet.status === "matched");
      setImportSheetIndex(initialIndex >= 0 ? initialIndex : 0);
      setStatus("预览已生成，请确认导入");
    } catch (error) {
      const message = error instanceof Error ? error.message : "预览失败";
      setStatus(`导入预览失败：${message}`);
      setPendingImportFile(null);
      setImportPreview(null);
      setImportSheetIndex(0);
    }
  }, [currentWorkbook, setStatus]);

  const handleImportConfirm = useCallback(async () => {
    if (!pendingImportFile) return;
    setImporting(true);
    try {
      await uploadExcel(pendingImportFile);
      setRevision((r) => r + 1);
      setImportPreview(null);
      setPendingImportFile(null);
      setImportSheetIndex(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : "导入失败";
      setStatus(`导入失败：${message}`);
    } finally {
      setImporting(false);
    }
  }, [pendingImportFile, uploadExcel, setStatus]);

  const handleImportCancel = useCallback(() => {
    if (importing) return;
    setImportPreview(null);
    setPendingImportFile(null);
    setImportSheetIndex(0);
    setStatus("已取消导入");
  }, [importing, setStatus]);

  const handleNewWbFileChange = useCallback(async (file: File) => {
    setStatus("上传中...");
    try {
      const result = await uploadNewWorkbook(file);
      const list = await fetchWorkbooks();
      setWorkbooks(Array.isArray(list) ? list : []);
      const idx = (Array.isArray(list) ? list : []).findIndex((w) => w.id === result.id);
      if (idx >= 0) {
        setWorkbookIdx(idx);
        const full = await fetchWorkbook(result.id);
        setCurrentWorkbook(full);
        setCurrentSheetIndex(0);
        setRevision(0);
      }
      setStatus("上传完成");
    } catch (error) {
      const message = error instanceof Error ? error.message : "上传失败";
      setStatus(`上传失败：${message}`);
    }
  }, [setWorkbooks, setWorkbookIdx, setCurrentWorkbook, setStatus]);

  const handleWorkbookDelete = useCallback(async (_workbookId: number) => {
    const list = await fetchWorkbooks();
    setWorkbooks(Array.isArray(list) ? list : []);
    const remaining = (Array.isArray(list) ? list : []).filter((w) => w.id !== _workbookId);
    if (remaining.length > 0) {
      const newIdx = 0;
      setWorkbookIdx(newIdx);
      const full = await fetchWorkbook(remaining[0].id);
      setCurrentWorkbook(full);
      setCurrentSheetIndex(0);
    } else {
      setWorkbookIdx(0);
      setCurrentWorkbook(null);
    }
    setRevision(0);
    setStatus("已删除");
  }, [setWorkbooks, setWorkbookIdx, setCurrentWorkbook, setStatus]);

  if (loading) {
    return <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>加载中...</div>;
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <WorkbenchHeader
        workbooks={workbooks}
        activeWorkbookIdx={workbookIdx}
        status={status}
        onSwitchWorkbook={handleSwitchWorkbook}
        onUploadClick={() => uploadInputRef.current?.click()}
        onUploadNewWorkbookClick={() => newWbInputRef.current?.click()}
      />

      <input
        ref={uploadInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUploadFileChange(f);
          e.target.value = "";
        }}
      />

      <input
        ref={newWbInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleNewWbFileChange(f);
          e.target.value = "";
        }}
      />

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <ExcelWorkspace
          workbook={currentWorkbook}
          currentSheetIndex={currentSheetIndex}
          revision={revision}
          onSheetIndexChange={setCurrentSheetIndex}
          onWorkbookDelete={handleWorkbookDelete}
        />
        <ChatSidebar
          onSheetChanged={handleSheetChanged}
          onUndoComplete={handleWorkbookRefresh}
          sheets={currentWorkbook?.sheets ?? []}
        />
      </div>

      <ImportPreviewDialog
        open={Boolean(importPreview)}
        preview={importPreview}
        activeSheetIndex={importSheetIndex}
        onSheetIndexChange={setImportSheetIndex}
        onCancel={handleImportCancel}
        onConfirm={handleImportConfirm}
        confirming={importing}
      />
    </div>
  );
}
