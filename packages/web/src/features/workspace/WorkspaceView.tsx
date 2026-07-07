import { useRef } from "react";
import type { WorkbookFull } from "@/api/workbooks";
import { WorkbookHeader } from "../workbook/ui/WorkbookHeader";
import { ExcelWorkspace } from "../workbook/ui/ExcelWorkspace";
import { ImportPreviewDialog } from "../workbook/import/ImportPreviewDialog";
import type { WorkbookImportPreview } from "../workbook/import/importPreview";
import type { WorkbookStructureUpdate } from "@/features/chat/hooks/useSheetPatchSync";
import { t } from "@/lib/i18n";
import styles from "./WorkspaceView.module.css";

type WorkbookMeta = {
  id: number;
  publicId: string;
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
  handleWorkbookRename: (workbookId: number, newName: string) => Promise<void>;
  handleWorkbookStructureChanged: (update: WorkbookStructureUpdate) => void;
  handleWorkbookRefresh: () => Promise<void>;
};

export function WorkspaceView({
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
  handleWorkbookRename,
  handleWorkbookStructureChanged,
  handleWorkbookRefresh,
}: Props) {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const newWbInputRef = useRef<HTMLInputElement>(null);

  if (loading) {
    return <div className={styles.loading}>{t("loading", "加载中...")}</div>;
  }

  return (
    <div className={styles.container}>
<WorkbookHeader
        workbooks={workbooks}
        activeWorkbookIdx={workbookIdx}
        status={status}
        onSwitchWorkbook={handleSwitchWorkbook}
        onUploadClick={() => uploadInputRef.current?.click()}
        onUploadNewWorkbookClick={() => newWbInputRef.current?.click()}
        onWorkbookRename={handleWorkbookRename}
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

      <div className={styles.excelArea}>
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