import { useRef } from "react";
import type { WorkbookFull } from "../../../api/workbooks";
import { WorkbookHeader } from "../ui/WorkbookHeader";
import { ExcelWorkspace } from "../ui/ExcelWorkspace";
import { ImportPreviewDialog } from "../import/ImportPreviewDialog";
import type { WorkbookImportPreview } from "../import/importPreview";
import type { WorkbookStructureUpdate } from "../../chat/hooks/useSheetPatchSync";

type WorkbookMeta = {
  id: number;
  name: string;
};

type Props = {
  workspaceId: number | null;
  workbooks: WorkbookMeta[];
  workbookIdx: number;
  currentWorkbook: WorkbookFull | null;
  workbookRevision: number;
  status: string;
  loading: boolean;
  currentSheetIndex: number;
  importPreview: WorkbookImportPreview | null;
  importSheetIndex: number;
  importing: boolean;
  setCurrentSheetIndex: (index: number) => void;
  setImportSheetIndex: (index: number) => void;
  handleSwitchWorkbook: (index: number) => void;
  handleUploadFileChange: (file: File) => void;
  handleImportConfirm: () => void;
  handleImportCancel: () => void;
  handleNewWorkbookFileChange: (file: File) => void;
  handleWorkbookDelete: (workbookId: number) => void;
  handleWorkbookStructureChanged: (update: WorkbookStructureUpdate) => void;
  handleWorkbookRefresh: () => Promise<void>;
};

export function WorkbookWorkspace({
  workspaceId,
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
  handleSwitchWorkbook,
  handleUploadFileChange,
  handleImportConfirm,
  handleImportCancel,
  handleNewWorkbookFileChange,
  handleWorkbookDelete,
  handleWorkbookStructureChanged,
  handleWorkbookRefresh,
}: Props) {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const newWbInputRef = useRef<HTMLInputElement>(null);

  if (loading) {
    return <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>加载中...</div>;
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <WorkbookHeader
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
          const file = e.target.files?.[0];
          if (file) void handleUploadFileChange(file);
          e.target.value = "";
        }}
      />

      <input
        ref={newWbInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleNewWorkbookFileChange(file);
          e.target.value = "";
        }}
      />

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      <ExcelWorkspace
        workspaceId={workspaceId}
        workbook={currentWorkbook}
        workbookRevision={workbookRevision}
        currentSheetIndex={currentSheetIndex}
          onSheetIndexChange={setCurrentSheetIndex}
          onWorkbookDelete={handleWorkbookDelete}
          onWorkbookStructureChanged={handleWorkbookStructureChanged}
          onWorkbookRefresh={handleWorkbookRefresh}
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
