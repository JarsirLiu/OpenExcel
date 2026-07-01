import { ExcelGrid } from "./ExcelGrid";
import type { WorkbookFull } from "../api/client";

interface Props {
  workbook: WorkbookFull | null;
  currentSheetIndex: number;
  revision?: number;
  onSheetIndexChange: (sheetIndex: number) => void;
  onWorkbookDelete?: (workbookId: number) => void;
}

export function ExcelWorkspace({ workbook, currentSheetIndex, revision, onSheetIndexChange, onWorkbookDelete }: Props) {
  return (
    <div style={{ flex: 1, minWidth: 0, overflow: "hidden", borderRight: "1px solid #e0e4ea" }}>
      <ExcelGrid
        workbook={workbook}
        currentSheetIndex={currentSheetIndex}
        revision={revision}
        onSheetIndexChange={onSheetIndexChange}
        onWorkbookDelete={onWorkbookDelete}
      />
    </div>
  );
}