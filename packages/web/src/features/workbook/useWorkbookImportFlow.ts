import { useCallback, useState } from "react";
import type { WorkbookFull } from "../../api/client";
import { buildWorkbookImportPreview, type WorkbookImportPreview } from "../../utils/importPreview";

type UseWorkbookImportFlowProps = {
  currentWorkbook: WorkbookFull | null;
  setStatus: (status: string) => void;
  uploadExcel: (file: File) => Promise<void>;
  onImportComplete?: () => Promise<void> | void;
};

export function useWorkbookImportFlow({
  currentWorkbook,
  setStatus,
  uploadExcel,
  onImportComplete,
}: UseWorkbookImportFlowProps) {
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<WorkbookImportPreview | null>(null);
  const [importSheetIndex, setImportSheetIndex] = useState(0);
  const [importing, setImporting] = useState(false);

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
      setImportPreview(null);
      setPendingImportFile(null);
      setImportSheetIndex(0);
      await onImportComplete?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "导入失败";
      setStatus(`导入失败：${message}`);
    } finally {
      setImporting(false);
    }
  }, [onImportComplete, pendingImportFile, setStatus, uploadExcel]);

  const handleImportCancel = useCallback(() => {
    if (importing) return;
    setImportPreview(null);
    setPendingImportFile(null);
    setImportSheetIndex(0);
    setStatus("已取消导入");
  }, [importing, setStatus]);

  return {
    importPreview,
    importSheetIndex,
    importing,
    setImportSheetIndex,
    handleUploadFileChange,
    handleImportConfirm,
    handleImportCancel,
  };
}
