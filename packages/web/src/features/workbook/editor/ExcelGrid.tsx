import { Workbook } from "@fortune-sheet/react";
import "@fortune-sheet/react/dist/index.css";
import { useRef } from "react";
import type { WorkbookFull } from "@/api/workbooks";
import type { WorkbookStructureUpdate } from "@/features/chat/hooks/useSheetPatchSync";
import { useChartInsertion } from "@/features/workbook/charts/useChartInsertion";
import styles from "./ExcelGrid.module.css";
import { useFortuneSheetFilterMenu } from "./fortuneSheetFilterMenu";
import { useExcelGridWorkspace } from "./useExcelGridWorkspace";
import { useFortuneSheetWheel } from "./useFortuneSheetWheel";

interface Props {
  workspaceId: number | null;
  workbook: WorkbookFull | null;
  workbookRevision: number;
  currentSheetIndex: number;
  onSheetIndexChange?: (sheetIndex: number) => void;
  onWorkbookDelete?: (workbookId: number) => void;
  onWorkbookStructureChanged?: (update: WorkbookStructureUpdate) => void;
  onWorkbookRefresh?: () => Promise<void> | void;
  onWorkbookMutation?: () => Promise<void> | void;
}

export function ExcelGrid({
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
  const gridRootRef = useRef<HTMLDivElement>(null);
  const {
    saveStatus,
    workbookRef,
    sheetData,
    sessionKey,
    handleChange,
    handleActivateSheet,
    handleBeforeAddSheet,
    handleBeforeDeleteSheet,
    handleBeforeUpdateSheetName,
    handleDeleteWorkbook,
  } = useExcelGridWorkspace({
    workspaceId,
    workbook,
    workbookRevision,
    currentSheetIndex,
    onSheetIndexChange,
    onWorkbookDelete,
    onWorkbookStructureChanged,
    onWorkbookRefresh,
    onWorkbookMutation,
  });
  useFortuneSheetFilterMenu(gridRootRef, workbook !== null);
  useFortuneSheetWheel(gridRootRef, workbook !== null);

  const { dialog, handleSelectionChange, toolbarItems } = useChartInsertion({
    workspaceId,
    workbook,
    currentSheetIndex,
    onWorkbookRefresh,
    onWorkbookMutation,
  });

  if (!workbook) return null;

  return (
    <div ref={gridRootRef} className={styles.container}>
      <div className={styles.inner}>
        <Workbook
          key={`${workbook.id}:${sessionKey}`}
          ref={workbookRef}
          data={sheetData as any}
          onChange={handleChange}
          showSheetTabs={true}
          showToolbar={true}
          showFormulaBar={true}
          toolbarItems={[
            "merge-cell",
            "|",
            "bold",
            "italic",
            "strike-through",
            "underline",
            "|",
            "font-color",
            "background",
            "border",
            "|",
            "horizontal-align",
            "vertical-align",
            "text-wrap",
            "|",
            "clear",
            "filter",
            "link",
            "comment",
          ]}
          customToolbarItems={toolbarItems}
          cellContextMenu={[
            "copy",
            "paste",
            "|",
            "insert-row",
            "insert-column",
            "delete-row",
            "delete-column",
            "delete-cell",
            "|",
            "clear",
            "sort",
            "orderAZ",
            "orderZA",
            "filter",
            "|",
            "data",
            "cell-format",
          ]}
          // @ts-expect-error allowUpdate is a valid prop but missing from types
          allowUpdate={true}
          hooks={{
            afterActivateSheet: handleActivateSheet,
            afterSelectionChange: handleSelectionChange,
            beforeAddSheet: handleBeforeAddSheet,
            beforeDeleteSheet: handleBeforeDeleteSheet,
            beforeUpdateSheetName: handleBeforeUpdateSheetName,
          }}
        />
      </div>
      {dialog}
    </div>
  );
}
