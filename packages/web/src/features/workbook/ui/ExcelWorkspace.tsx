import type { WorkbookFull } from "@/api/workbooks";
import type {
  CommittedSheetContentChangeHandler,
  CommittedSheetMutationHandler,
  SheetContentChangeHandler,
} from "@/features/sync/sheetEditorChange";
import type { WorkbookStructureUpdate } from "@/features/sync/types";
import type { ChartMutation } from "@/features/workbook/charts/chartMutation";
import type { DemoGridFocus } from "@/features/workbook/editor/demoGridFocus";
import { ExcelGrid } from "@/features/workbook/editor/ExcelGrid";
import type { WorkbookDocumentStore } from "@/features/workspace/WorkbookDocumentStore";
import styles from "./ExcelWorkspace.module.css";

interface Props {
  workspaceId: number | null;
  workbook: WorkbookFull | null;
  documentStore: WorkbookDocumentStore;
  workbookRevision: number;
  currentSheetIndex: number;
  onSheetIndexChange: (sheetIndex: number) => void;
  sheetLoading: boolean;
  sheetLoadError: string | null;
  onRetrySheetLoad: () => void;
  onSheetLoad: (sheetId: number) => Promise<void>;
  onWorkbookDelete?: (workbookId: number) => void;
  onWorkbookStructureChanged?: (update: WorkbookStructureUpdate) => void;
  onWorkbookRefresh?: () => Promise<void>;
  onChartMutation?: (mutation: ChartMutation) => Promise<void> | void;
  onWorkbookMutation?: () => Promise<void> | void;
  onSheetRevisionChanged?: (
    sheetId: number,
    revision: number,
    persistedThroughVersion?: number,
  ) => void;
  onSheetContentChanged?: SheetContentChangeHandler;
  onCommittedSheetContentChanged?: CommittedSheetContentChangeHandler;
  onRegisterCommittedSheetMutation?: (handler: CommittedSheetMutationHandler | null) => void;
  onEnsureAllSheetsLoaded?: () => Promise<WorkbookFull | null>;
  demoGridFocus?: DemoGridFocus;
}

export function ExcelWorkspace({
  workspaceId,
  workbook,
  documentStore,
  workbookRevision,
  currentSheetIndex,
  onSheetIndexChange,
  sheetLoading,
  sheetLoadError,
  onRetrySheetLoad,
  onSheetLoad,
  onWorkbookDelete,
  onWorkbookStructureChanged,
  onWorkbookRefresh,
  onChartMutation,
  onWorkbookMutation,
  onSheetRevisionChanged,
  onSheetContentChanged,
  onCommittedSheetContentChanged,
  onRegisterCommittedSheetMutation,
  onEnsureAllSheetsLoaded,
  demoGridFocus,
}: Props) {
  return (
    <div className={styles.container}>
      <div className={styles.grid}>
        <ExcelGrid
          workspaceId={workspaceId}
          workbook={workbook}
          documentStore={documentStore}
          workbookRevision={workbookRevision}
          currentSheetIndex={currentSheetIndex}
          onSheetIndexChange={onSheetIndexChange}
          sheetLoading={sheetLoading}
          sheetLoadError={sheetLoadError}
          onRetrySheetLoad={onRetrySheetLoad}
          onSheetLoad={onSheetLoad}
          onWorkbookDelete={onWorkbookDelete}
          onWorkbookStructureChanged={onWorkbookStructureChanged}
          onWorkbookRefresh={onWorkbookRefresh}
          onChartMutation={onChartMutation}
          onWorkbookMutation={onWorkbookMutation}
          onSheetRevisionChanged={onSheetRevisionChanged}
          onSheetContentChanged={onSheetContentChanged}
          onCommittedSheetContentChanged={onCommittedSheetContentChanged}
          onRegisterCommittedSheetMutation={onRegisterCommittedSheetMutation}
          onEnsureAllSheetsLoaded={onEnsureAllSheetsLoaded}
          demoGridFocus={demoGridFocus}
        />
      </div>
    </div>
  );
}
