import { useRef, useState, useCallback } from "react";
import { useWorkbench } from "../hooks/useWorkbench";
import { createSheet, deleteSheet } from "../api/client";
import { WorkbenchHeader } from "./WorkbenchHeader";
import { ExcelWorkspace } from "./ExcelWorkspace";
import { ChatSidebar } from "./ChatSidebar";

export function Workbench() {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const {
    workbooks,
    workbookIdx,
    switchWorkbook,
    currentWorkbook,
    uploadExcel,
    downloadTemplate,
    status,
    loading,
    refreshWorkbook,
  } = useWorkbench();

  const [currentSheetIndex, setCurrentSheetIndex] = useState(0);

  const handleCreateSheet = useCallback(async () => {
    if (!currentWorkbook) return;
    const created = await createSheet(currentWorkbook.id, currentWorkbook.sheets[currentSheetIndex]?.id);
    const refreshed = await refreshWorkbook();
    if (refreshed) {
      const nextIndex = refreshed.sheets.findIndex((sheet) => sheet.id === created.id);
      setCurrentSheetIndex(nextIndex >= 0 ? nextIndex : refreshed.sheets.length - 1);
    }
  }, [currentWorkbook, currentSheetIndex, refreshWorkbook]);

  const handleDeleteSheet = useCallback(async () => {
    if (!currentWorkbook) return;
    const currentSheet = currentWorkbook.sheets[currentSheetIndex];
    if (!currentSheet) return;
    await deleteSheet(currentSheet.id);
    const nextIndex = Math.max(0, currentSheetIndex - 1);
    const refreshed = await refreshWorkbook();
    if (refreshed) {
      setCurrentSheetIndex(Math.min(nextIndex, refreshed.sheets.length - 1));
    }
  }, [currentWorkbook, currentSheetIndex, refreshWorkbook]);

  const handleSwitchWorkbook = useCallback(async (index: number) => {
    await switchWorkbook(index);
    setCurrentSheetIndex(0);
  }, [switchWorkbook]);

  const handleUploadFileChange = useCallback(async (file: File) => {
    await uploadExcel(file);
  }, [uploadExcel]);

  if (loading) {
    return <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>加载中...</div>;
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <WorkbenchHeader
        workbooks={workbooks}
        activeWorkbookIdx={workbookIdx}
        status={status}
        uploadInputRef={uploadInputRef}
        onSwitchWorkbook={handleSwitchWorkbook}
        onDownloadTemplate={downloadTemplate}
        onUploadClick={() => uploadInputRef.current?.click()}
        onUploadFileChange={handleUploadFileChange}
        onCreateSheet={handleCreateSheet}
        onDeleteSheet={handleDeleteSheet}
      />

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <ExcelWorkspace
          workbook={currentWorkbook}
          currentSheetIndex={currentSheetIndex}
          onSheetIndexChange={setCurrentSheetIndex}
        />
        <ChatSidebar />
      </div>
    </div>
  );
}
