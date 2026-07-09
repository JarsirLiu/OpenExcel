import { Workbook } from "@fortune-sheet/react";
import "@fortune-sheet/react/dist/index.css";
import type { WorkbookFull } from "@/api/workbooks";
import type { WorkbookStructureUpdate } from "@/features/chat/hooks/useSheetPatchSync";
import styles from "./ExcelGrid.module.css";
import { useExcelGridWorkspace } from "./useExcelGridWorkspace";

interface Props {
  workspaceId: number | null;
  workbook: WorkbookFull | null;
  workbookRevision: number;
  currentSheetIndex: number;
  onSheetIndexChange?: (sheetIndex: number) => void;
  onWorkbookDelete?: (workbookId: number) => void;
  onWorkbookStructureChanged?: (update: WorkbookStructureUpdate) => void;
  onWorkbookRefresh?: () => Promise<void> | void;
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
}: Props) {
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
    handleDownload,
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
  });

  if (!workbook) return null;

  return (
    <div className={styles.container}>
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
            beforeAddSheet: handleBeforeAddSheet,
            beforeDeleteSheet: handleBeforeDeleteSheet,
            beforeUpdateSheetName: handleBeforeUpdateSheetName,
          }}
        />
      </div>
    </div>
  );
}
