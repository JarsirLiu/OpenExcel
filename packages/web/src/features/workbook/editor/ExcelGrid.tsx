import { Workbook } from "@fortune-sheet/react";
import { useMemo, useRef } from "react";
import "@fortune-sheet/react/dist/index.css";
import type { WorkbookFull } from "@/api/workbooks";
import type { WorkbookStructureUpdate } from "@/features/sync/types";
import { ChartOverlay } from "@/features/workbook/charts/ChartOverlay";
import { useChartInsertion } from "@/features/workbook/charts/useChartInsertion";
import { normalizeSheetIndex } from "@/features/workspace/sheetIndex";
import { type DemoGridFocus, useDemoGridFocus } from "./demoGridFocus";
import styles from "./ExcelGrid.module.css";
import { useFortuneSheetFilterMenu } from "./fortuneSheetFilterMenu";
import { useExcelGridWorkspace } from "./useExcelGridWorkspace";
import { useFortuneSheetWheel } from "./useFortuneSheetWheel";

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

const CELL_CONTEXT_MENU = [
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
  onWorkbookMutation?: () => Promise<void> | void;
  onSheetRevisionChanged?: (sheetId: number, revision: number) => void;
  demoGridFocus?: DemoGridFocus;
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
  onSheetRevisionChanged,
  demoGridFocus,
}: Props) {
  const gridRootRef = useRef<HTMLDivElement>(null);
  const {
    saveStatus,
    workbookRef,
    sheetData,
    sessionKey,
    layoutBySheetId,
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
    onSheetRevisionChanged,
  });
  useFortuneSheetFilterMenu(gridRootRef, workbook !== null);
  useFortuneSheetWheel(gridRootRef, workbook !== null);
  const isDemoFocusActive = useDemoGridFocus({
    workbookRef,
    focus: demoGridFocus,
    sessionKey,
  });

  const { dialog, handleSelectionChange, toolbarItems } = useChartInsertion({
    workspaceId,
    workbook,
    workbookRef,
    currentSheetIndex,
    onWorkbookRefresh,
    onWorkbookMutation,
  });
  const hooks = useMemo(
    () => ({
      afterActivateSheet: handleActivateSheet,
      afterSelectionChange: handleSelectionChange,
      beforeAddSheet: handleBeforeAddSheet,
      beforeDeleteSheet: handleBeforeDeleteSheet,
      beforeUpdateSheetName: handleBeforeUpdateSheetName,
    }),
    [
      handleActivateSheet,
      handleBeforeAddSheet,
      handleBeforeDeleteSheet,
      handleBeforeUpdateSheetName,
      handleSelectionChange,
    ],
  );

  if (!workbook) return null;

  if (workbook.sheets.length === 0) {
    return (
      <div ref={gridRootRef} className={styles.container}>
        <div className={styles.emptyState}>
          <p>这个工作簿还没有工作表</p>
          <button type="button" onClick={() => handleBeforeAddSheet({ name: "Sheet1" })}>
            <span aria-hidden="true">+</span>
            新建工作表
          </button>
        </div>
      </div>
    );
  }

  const safeSheetIndex = normalizeSheetIndex(currentSheetIndex, workbook.sheets.length);
  const currentSheet = workbook.sheets[safeSheetIndex];
  const currentSheetLayout = currentSheet ? layoutBySheetId[String(currentSheet.id)] : undefined;

  return (
    <div
      ref={gridRootRef}
      className={`${styles.container} ${isDemoFocusActive ? styles.demoFocusActive : ""}`}
    >
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
          customToolbarItems={toolbarItems}
          cellContextMenu={CELL_CONTEXT_MENU}
          // @ts-expect-error allowUpdate is a valid prop but missing from types
          allowUpdate={true}
          hooks={hooks}
        />
      </div>
      {currentSheet && currentSheetLayout ? (
        <ChartOverlay
          containerRef={gridRootRef}
          workspaceId={workspaceId}
          workbook={workbook}
          sheetId={String(currentSheet.id)}
          layout={currentSheetLayout}
          onWorkbookRefresh={onWorkbookRefresh}
          onWorkbookMutation={onWorkbookMutation}
        />
      ) : null}
      {dialog}
    </div>
  );
}
