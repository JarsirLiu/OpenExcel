import type { WorkbookFull } from "@/api/workbooks";
import type {
  SheetMutationUpdate,
  WorkbookStructureUpdate,
} from "@/features/chat/hooks/sheetMutationMessages";
import { ExcelGrid } from "@/features/workbook/editor/ExcelGrid";
import styles from "./ExcelWorkspace.module.css";

interface Props {
  workspaceId: number | null;
  workbook: WorkbookFull | null;
  workbookRevision: number;
  currentSheetIndex: number;
  onSheetIndexChange: (sheetIndex: number) => void;
  onWorkbookDelete?: (workbookId: number) => void;
  onWorkbookStructureChanged?: (update: WorkbookStructureUpdate) => void;
  onWorkbookRefresh?: () => Promise<void>;
  onRegisterSheetMutationHandler?: (
    handler: ((update: SheetMutationUpdate) => Promise<void> | void) | null,
  ) => void;
}

export function ExcelWorkspace({
  workspaceId,
  workbook,
  workbookRevision,
  currentSheetIndex,
  onSheetIndexChange,
  onWorkbookDelete,
  onWorkbookStructureChanged,
  onWorkbookRefresh,
  onRegisterSheetMutationHandler,
}: Props) {
  return (
    <div className={styles.container}>
      <ExcelGrid
        workspaceId={workspaceId}
        workbook={workbook}
        workbookRevision={workbookRevision}
        currentSheetIndex={currentSheetIndex}
        onSheetIndexChange={onSheetIndexChange}
        onWorkbookDelete={onWorkbookDelete}
        onWorkbookStructureChanged={onWorkbookStructureChanged}
        onWorkbookRefresh={onWorkbookRefresh}
        onRegisterSheetMutationHandler={onRegisterSheetMutationHandler}
      />
    </div>
  );
}
