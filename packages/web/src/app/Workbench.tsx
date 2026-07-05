import { ChatSidebar } from "../features/chat/ChatSidebar";
import { WorkbookWorkspace } from "../features/workbook/workspace/WorkbookWorkspace";
import { useWorkbookWorkspace } from "../features/workbook/workspace/useWorkbookWorkspace";
import { useWorkspaceState } from "../features/workspace/useWorkspaceState";

type CurrentUser = {
  email: string;
  displayName: string;
};

type Props = {
  currentUser: CurrentUser;
  onLogout: () => void;
};

export function Workbench({ currentUser, onLogout }: Props) {
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspaceState();
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
    referenceCacheRevision,
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
  } = useWorkbookWorkspace(activeWorkspaceId);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div
        style={{
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          background: "linear-gradient(135deg, #0f172a 0%, #111827 55%, #1f2937 100%)",
          color: "#f8fafc",
          borderBottom: "1px solid rgba(148, 163, 184, 0.18)",
          boxShadow: "0 12px 30px rgba(15, 23, 42, 0.24)",
          flexShrink: 0,
        }}
      >
        <div>
          <div style={{ fontSize: 14, letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.72 }}>OpenExcel</div>
          <div style={{ fontSize: 13, opacity: 0.84 }}>
            已登录为 {currentUser.displayName} · {currentUser.email}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void onLogout()}
          style={{
            border: "1px solid rgba(148, 163, 184, 0.25)",
            background: "rgba(15, 23, 42, 0.7)",
            color: "#fff",
            borderRadius: 999,
            padding: "10px 16px",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          退出登录
        </button>
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <WorkbookWorkspace
            workspaceId={activeWorkspaceId}
            workbooks={workbooks}
            workbookIdx={workbookIdx}
            currentWorkbook={currentWorkbook}
            workbookRevision={workbookRevision}
            status={status}
            loading={loading || workspaceLoading}
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
          workspaceId={activeWorkspaceId}
          onSheetChanged={handleSheetChanged}
          onWorkbookStructureChanged={handleWorkbookStructureChanged}
          onUndoComplete={handleWorkbookRefresh}
          onAttachExcel={handleNewWorkbookFileChange}
          referenceCacheRevision={referenceCacheRevision}
        />
      </div>
    </div>
  );
}
