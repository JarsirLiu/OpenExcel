import { useRef } from "react";
import type { WorkbookFull } from "@/api/workbooks";
import type { WorkbookStructureUpdate } from "@/features/chat/hooks/useSheetPatchSync";
import { t } from "@/lib/i18n";
import { ExcelWorkspace } from "../workbook/ui/ExcelWorkspace";
import { WorkbookHeader } from "../workbook/ui/WorkbookHeader";
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
  loading: boolean;
  currentSheetIndex: number;
  setCurrentSheetIndex: (index: number) => void;
  handleSwitchWorkbook: (index: number) => void;
  handleNewWorkbookFileChange: (files: File[]) => Promise<boolean>;
  handleWorkbookDelete: (workbookId: number) => void;
  handleWorkbookRename: (workbookId: number, newName: string) => Promise<void>;
  handleWorkbookStructureChanged: (update: WorkbookStructureUpdate) => void;
  handleWorkbookRefresh: () => Promise<void>;
  onWorkbookMutation?: () => Promise<void> | void;
  presentationMode?: boolean;
};

export function WorkspaceView({
  workspaceId,
  workbooks,
  workbookIdx,
  currentWorkbook,
  workbookRevision,
  loading,
  currentSheetIndex,
  setCurrentSheetIndex,
  handleSwitchWorkbook,
  handleNewWorkbookFileChange,
  handleWorkbookDelete,
  handleWorkbookRename,
  handleWorkbookStructureChanged,
  handleWorkbookRefresh,
  onWorkbookMutation,
  presentationMode = false,
}: Props) {
  const newWbInputRef = useRef<HTMLInputElement>(null);

  if (loading) {
    return <div className={styles.loading}>{t("loading", "加载中...")}</div>;
  }

  return (
    <div className={styles.container}>
      <WorkbookHeader
        workbooks={workbooks}
        activeWorkbookIdx={workbookIdx}
        onSwitchWorkbook={handleSwitchWorkbook}
        onUploadNewWorkbookClick={() => newWbInputRef.current?.click()}
        onWorkbookRename={handleWorkbookRename}
        presentationMode={presentationMode}
      />

      <input
        ref={newWbInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) void handleNewWorkbookFileChange(files);
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
          onWorkbookMutation={onWorkbookMutation}
        />
      </div>
    </div>
  );
}
