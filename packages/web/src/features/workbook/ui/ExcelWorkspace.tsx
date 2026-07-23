import type { WorkbookFull } from "@/api/workbooks";
import type { WorkbookStructureUpdate } from "@/features/sync/types";
import type { DemoGridFocus } from "@/features/workbook/editor/demoGridFocus";
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
  onWorkbookMutation?: () => Promise<void> | void;
  onSheetRevisionChanged?: (sheetId: number, revision: number) => void;
  demoGridFocus?: DemoGridFocus;
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
  onWorkbookMutation,
  onSheetRevisionChanged,
  demoGridFocus,
}: Props) {
  return (
    <div className={styles.container}>
      <div className={styles.grid}>
        <ExcelGrid
          workspaceId={workspaceId}
          workbook={workbook}
          workbookRevision={workbookRevision}
          currentSheetIndex={currentSheetIndex}
          onSheetIndexChange={onSheetIndexChange}
          onWorkbookDelete={onWorkbookDelete}
          onWorkbookStructureChanged={onWorkbookStructureChanged}
          onWorkbookRefresh={onWorkbookRefresh}
          onWorkbookMutation={onWorkbookMutation}
          onSheetRevisionChanged={onSheetRevisionChanged}
          demoGridFocus={demoGridFocus}
        />
      </div>
    </div>
  );
}
