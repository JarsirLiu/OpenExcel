import { Workbook } from "@fortune-sheet/react";
import "@fortune-sheet/react/dist/index.css";
import { useMemo } from "react";
import type { WorkbookFull } from "@/api/workbooks";
import type {
  SheetMutationUpdate,
  WorkbookStructureUpdate,
} from "@/features/chat/hooks/sheetMutationMessages";
import styles from "./ExcelGrid.module.css";
import { useExcelGridWorkspace } from "./useExcelGridWorkspace";

const TOOLBAR_ITEMS = [
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
];

const CELL_CONTEXT_MENU_ITEMS = [
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
];

interface Props {
  workspaceId: number | null;
  workbook: WorkbookFull | null;
  workbookRevision: number;
  currentSheetIndex: number;
  onSheetIndexChange?: (sheetIndex: number) => void;
  onWorkbookDelete?: (workbookId: number) => void;
  onWorkbookStructureChanged?: (update: WorkbookStructureUpdate) => void;
  onWorkbookRefresh?: () => Promise<void> | void;
  onRegisterSheetMutationHandler?: (
    handler: ((update: SheetMutationUpdate) => Promise<void> | void) | null,
  ) => void;
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
  onRegisterSheetMutationHandler,
}: Props) {
  const {
    saveStatus,
    workbookRef,
    gridRootRef,
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
    onRegisterSheetMutationHandler,
  });
  const hooks = useMemo(
    () => ({
      afterActivateSheet: handleActivateSheet,
      beforeAddSheet: handleBeforeAddSheet,
      beforeDeleteSheet: handleBeforeDeleteSheet,
      beforeUpdateSheetName: handleBeforeUpdateSheetName,
    }),
    [
      handleActivateSheet,
      handleBeforeAddSheet,
      handleBeforeDeleteSheet,
      handleBeforeUpdateSheetName,
    ],
  );

  if (!workbook) return null;

  return (
    <div ref={gridRootRef} className={styles.container}>
      {saveStatus === "conflict" && (
        <div className={styles.conflictNotice} role="alert">
          工作表已被其他操作更新，本次本地修改未覆盖远程数据。
        </div>
      )}
      <div className={styles.inner}>
        <Workbook
          key={`${workbook.id}:${sessionKey}`}
          ref={workbookRef}
          data={sheetData as any}
          onChange={handleChange}
          showSheetTabs={true}
          showToolbar={true}
          showFormulaBar={true}
          toolbarItems={TOOLBAR_ITEMS}
          cellContextMenu={CELL_CONTEXT_MENU_ITEMS}
          // @ts-expect-error allowUpdate is a valid prop but missing from types
          allowUpdate={true}
          hooks={hooks}
        />
      </div>
    </div>
  );
}
