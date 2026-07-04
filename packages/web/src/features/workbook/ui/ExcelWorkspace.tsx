import { ExcelGrid } from "../editor/ExcelGrid";
import type { WorkbookFull } from "../../../api/workbooks";
import type { WorkbookStructureUpdate } from "../../chat/hooks/useSheetPatchSync";

interface Props {
  workspaceId: number | null;
  workbook: WorkbookFull | null;
  workbookRevision: number;
  currentSheetIndex: number;
  onSheetIndexChange: (sheetIndex: number) => void;
  onWorkbookDelete?: (workbookId: number) => void;
  onWorkbookStructureChanged?: (update: WorkbookStructureUpdate) => void;
  onWorkbookRefresh?: () => Promise<void>;
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
}: Props) {
  return (
    <div style={{ flex: 1, minWidth: 0, overflow: "hidden", borderRight: "1px solid var(--border)" }}>
      <ExcelGrid
        workspaceId={workspaceId}
        workbook={workbook}
        workbookRevision={workbookRevision}
        currentSheetIndex={currentSheetIndex}
        onSheetIndexChange={onSheetIndexChange}
        onWorkbookDelete={onWorkbookDelete}
        onWorkbookStructureChanged={onWorkbookStructureChanged}
        onWorkbookRefresh={onWorkbookRefresh}
      />
    </div>
  );
}
