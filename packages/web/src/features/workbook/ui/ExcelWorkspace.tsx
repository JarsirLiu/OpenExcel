import type { WorkbookFull } from "@/api/workbooks";
import type { WorkbookStructureUpdate } from "@/features/chat/hooks/useSheetPatchSync";
import { ChartViewport } from "@/features/workbook/charts/ChartViewport";
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
}: Props) {
  const currentSheet = workbook?.sheets[currentSheetIndex];

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
        />
      </div>
      {workbook && currentSheet ? (
        <ChartViewport workbook={workbook} sheetId={currentSheet.id} />
      ) : null}
    </div>
  );
}
