import { useEffect, useRef } from "react";
import type { WorkbookFull } from "@/api/workbooks";
import type { SheetContentChangeHandler } from "@/features/sync/sheetEditorChange";
import type { WorkbookStructureUpdate } from "@/features/sync/types";
import type { ChartMutation } from "@/features/workbook/charts/chartMutation";
import type { DemoGridFocus } from "@/features/workbook/editor/demoGridFocus";
import { t } from "@/lib/i18n";
import { preloadChartRenderer } from "../workbook/charts/ChartRendererBoundary";
import { ExcelWorkspace } from "../workbook/ui/ExcelWorkspace";
import { WorkbookHeader } from "../workbook/ui/WorkbookHeader";
import type { WorkbookTransition } from "./useWorkbookCatalog";
import type { WorkbookDocumentStore } from "./WorkbookDocumentStore";
import { WorkspaceEmptyState } from "./WorkspaceEmptyState";
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
  documentStore: WorkbookDocumentStore;
  workbookRevision: number;
  loading: boolean;
  transition: WorkbookTransition | null;
  onRetryWorkbookTransition: () => void;
  currentSheetIndex: number;
  setCurrentSheetIndex: (index: number) => void;
  sheetLoading: boolean;
  sheetLoadError: string | null;
  onRetrySheetLoad: () => void;
  onSheetLoad: (sheetId: number) => Promise<void>;
  handleSwitchWorkbook: (index: number) => void;
  handleNewWorkbookFileChange: (files: File[]) => Promise<boolean>;
  onCreateEmptyWorkbook: () => Promise<void>;
  onImportEmptyWorkbook: (file: File) => Promise<void>;
  handleWorkbookDelete: (workbookId: number) => void;
  handleWorkbookRename: (workbookId: number, newName: string) => Promise<void>;
  handleWorkbookStructureChanged: (update: WorkbookStructureUpdate) => void;
  handleWorkbookRefresh: () => Promise<void>;
  onWorkbookMutation?: () => Promise<void> | void;
  onChartMutation?: (mutation: ChartMutation) => Promise<void> | void;
  onSheetRevisionChanged?: (
    sheetId: number,
    revision: number,
    persistedThroughVersion?: number,
  ) => void;
  onSheetContentChanged?: SheetContentChangeHandler;
  presentationMode?: boolean;
  demoGridFocus?: DemoGridFocus;
};

export function WorkspaceView({
  workspaceId,
  workbooks,
  workbookIdx,
  currentWorkbook,
  documentStore,
  workbookRevision,
  loading,
  transition,
  onRetryWorkbookTransition,
  currentSheetIndex,
  setCurrentSheetIndex,
  sheetLoading,
  sheetLoadError,
  onRetrySheetLoad,
  onSheetLoad,
  handleSwitchWorkbook,
  handleNewWorkbookFileChange,
  onCreateEmptyWorkbook,
  onImportEmptyWorkbook,
  handleWorkbookDelete,
  handleWorkbookRename,
  handleWorkbookStructureChanged,
  handleWorkbookRefresh,
  onWorkbookMutation,
  onChartMutation,
  onSheetRevisionChanged,
  onSheetContentChanged,
  presentationMode = false,
  demoGridFocus,
}: Props) {
  const newWbInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    preloadChartRenderer();
  }, []);

  if (loading && !currentWorkbook) {
    return <div className={styles.loading}>{t("loading")}</div>;
  }

  if (!loading && currentWorkbook == null && transition == null) {
    return (
      <div className={styles.container}>
        <WorkspaceEmptyState
          hasWorkspace={workspaceId != null}
          onCreateWorkbook={onCreateEmptyWorkbook}
          onImportWorkbook={onImportEmptyWorkbook}
        />
      </div>
    );
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
          documentStore={documentStore}
          workbookRevision={workbookRevision}
          currentSheetIndex={currentSheetIndex}
          onSheetIndexChange={setCurrentSheetIndex}
          sheetLoading={sheetLoading}
          sheetLoadError={sheetLoadError}
          onRetrySheetLoad={onRetrySheetLoad}
          onSheetLoad={onSheetLoad}
          onWorkbookDelete={handleWorkbookDelete}
          onWorkbookStructureChanged={handleWorkbookStructureChanged}
          onWorkbookRefresh={handleWorkbookRefresh}
          onWorkbookMutation={onWorkbookMutation}
          onChartMutation={onChartMutation}
          onSheetRevisionChanged={onSheetRevisionChanged}
          onSheetContentChanged={onSheetContentChanged}
          demoGridFocus={demoGridFocus}
        />
        {transition?.status === "loading" && (
          <div className={styles.transitionOverlay} role="status" aria-live="polite">
            <span>{t("switchingWorkbook")}</span>
          </div>
        )}
        {transition?.status === "failed" && (
          <div className={styles.transitionError} role="alert">
            <span>{transition.error ?? t("workbookLoadFailed")}</span>
            <button type="button" onClick={onRetryWorkbookTransition}>
              {t("retry")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
