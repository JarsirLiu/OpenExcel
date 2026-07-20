import type { WorkbookInstance } from "@fortune-sheet/react";
import type { ChartSpec } from "@openexcel/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createChart } from "@/api/charts";
import type { WorkbookFull } from "@/api/workbooks";
import { ChartIcon } from "./ChartIcon";
import { ChartInsertDialog } from "./ChartInsertDialog";
import { type FortuneSelection, normalizeChartSelection } from "./chartSelection";

type Props = {
  workspaceId: number | null;
  workbook: WorkbookFull | null;
  workbookRef: React.RefObject<WorkbookInstance | null>;
  currentSheetIndex: number;
  onWorkbookRefresh?: () => Promise<void> | void;
  onWorkbookMutation?: () => Promise<void> | void;
};

export function useChartInsertion({
  workspaceId,
  workbook,
  workbookRef,
  currentSheetIndex,
  onWorkbookRefresh,
  onWorkbookMutation,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<ReturnType<typeof normalizeChartSelection>>(null);
  const [selectionSheetId, setSelectionSheetId] = useState<string | null>(null);
  const currentSheet = workbook?.sheets[currentSheetIndex];
  const currentSheetRef = useRef(currentSheet);
  currentSheetRef.current = currentSheet;

  useEffect(() => {
    setSelection(null);
    setSelectionSheetId(currentSheet ? String(currentSheet.id) : null);
  }, [currentSheet?.id]);

  const applySelection = useCallback((sheetId: string, nextSelection: FortuneSelection) => {
    setSelectionSheetId(sheetId);
    setSelection(normalizeChartSelection(nextSelection));
  }, []);

  const handleSelectionChange = useCallback(
    (sheetId: string, nextSelection: FortuneSelection) => {
      const sheet = currentSheetRef.current;
      if (!sheet || String(sheet.id) !== String(sheetId)) return;
      applySelection(String(sheetId), nextSelection);
    },
    [applySelection],
  );

  const handleOpen = useCallback(() => {
    const instance = workbookRef.current;
    const activeSheet = instance?.getSheet();
    const sheet = currentSheetRef.current;
    const activeSheetId =
      activeSheet?.id != null
        ? String(activeSheet.id)
        : sheet?.id != null
          ? String(sheet.id)
          : undefined;
    const activeSelection = instance?.getSelection()?.[0];

    if (activeSheetId && activeSelection) {
      applySelection(activeSheetId, activeSelection);
    }
    setOpen(true);
  }, [applySelection, workbookRef]);

  const handleCreate = useCallback(
    async (draft: Omit<ChartSpec, "id">) => {
      if (workspaceId == null || !workbook) throw new Error("当前工作簿不可用");
      await createChart(workspaceId, workbook.id, draft);
      await onWorkbookRefresh?.();
      await onWorkbookMutation?.();
    },
    [onWorkbookMutation, onWorkbookRefresh, workbook, workspaceId],
  );

  const selectedSheet =
    workbook?.sheets.find((sheet) => String(sheet.id) === selectionSheetId) ?? currentSheet;

  const dialog = useMemo(
    () =>
      workbook && selectedSheet ? (
        <ChartInsertDialog
          open={open}
          workbookId={workbook.id}
          sheetId={selectedSheet.id}
          sheetName={selectedSheet.name}
          selection={selection}
          onClose={() => setOpen(false)}
          onCreate={handleCreate}
        />
      ) : null,
    [handleCreate, open, selectedSheet, selection, workbook],
  );

  const toolbarItems = useMemo(
    () => [
      {
        key: "insert-chart",
        tooltip: "插入图表",
        icon: <ChartIcon size={18} />,
        onClick: handleOpen,
      },
    ],
    [handleOpen],
  );

  return {
    dialog,
    handleSelectionChange,
    toolbarItems,
  };
}
