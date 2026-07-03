import { ChatSidebar } from "./ChatSidebar";
import { WorkbookWorkspace } from "../features/workbook/WorkbookWorkspace";
import { useWorkbookWorkspace } from "../features/workbook/useWorkbookWorkspace";

export function Workbench() {
  const {
    workbooks,
    workbookIdx,
    currentWorkbook,
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
    handleWorkbookRefresh,
    handleSwitchWorkbook,
    handleUploadFileChange,
    handleImportConfirm,
    handleImportCancel,
    handleNewWorkbookFileChange,
    handleWorkbookDelete,
  } = useWorkbookWorkspace();

  return (
    <div style={{ height: "100vh", display: "flex", overflow: "hidden" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <WorkbookWorkspace
          workbooks={workbooks}
          workbookIdx={workbookIdx}
          currentWorkbook={currentWorkbook}
          status={status}
          loading={loading}
          currentSheetIndex={currentSheetIndex}
          importPreview={importPreview}
          importSheetIndex={importSheetIndex}
          importing={importing}
          setCurrentSheetIndex={setCurrentSheetIndex}
          setImportSheetIndex={setImportSheetIndex}
          handleSwitchWorkbook={handleSwitchWorkbook}
          handleUploadFileChange={handleUploadFileChange}
          handleImportConfirm={handleImportConfirm}
          handleImportCancel={handleImportCancel}
          handleNewWorkbookFileChange={handleNewWorkbookFileChange}
          handleWorkbookDelete={handleWorkbookDelete}
        />
      </div>
      <ChatSidebar
        onSheetChanged={handleSheetChanged}
        onUndoComplete={handleWorkbookRefresh}
        sheets={allSheets}
      />
    </div>
  );
}
