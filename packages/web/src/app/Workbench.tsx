import { ChatSidebar } from "../features/chat/ChatSidebar";
import { WorkbookWorkspace } from "../features/workbook/workspace/WorkbookWorkspace";
import { useWorkbookWorkspace } from "../features/workbook/workspace/useWorkbookWorkspace";

export function Workbench() {
  const {
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
          workbookRevision={workbookRevision}
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
        handleWorkbookStructureChanged={handleWorkbookStructureChanged}
        handleWorkbookRefresh={handleWorkbookRefresh}
      />
      </div>
      <ChatSidebar
        onSheetChanged={handleSheetChanged}
        onWorkbookStructureChanged={handleWorkbookStructureChanged}
        onUndoComplete={handleWorkbookRefresh}
        sheets={allSheets}
      />
    </div>
  );
}
