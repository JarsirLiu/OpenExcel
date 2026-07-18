import type { ChartSpec } from "@openexcel/core";
import { useCallback, useEffect, useState } from "react";
import { createChart } from "@/api/charts";
import type { WorkbookFull } from "@/api/workbooks";
import { ChartInsertDialog } from "./ChartInsertDialog";
import { type FortuneSelection, normalizeChartSelection } from "./chartSelection";

type Props = {
  workspaceId: number | null;
  workbook: WorkbookFull | null;
  currentSheetIndex: number;
  onWorkbookRefresh?: () => Promise<void> | void;
  onWorkbookMutation?: () => Promise<void> | void;
};

export function useChartInsertion({
  workspaceId,
  workbook,
  currentSheetIndex,
  onWorkbookRefresh,
  onWorkbookMutation,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<ReturnType<typeof normalizeChartSelection>>(null);
  const currentSheet = workbook?.sheets[currentSheetIndex];

  useEffect(() => {
    setSelection(null);
  }, [currentSheet?.id]);

  const handleSelectionChange = useCallback(
    (sheetId: string, nextSelection: FortuneSelection) => {
      if (!currentSheet || String(currentSheet.id) !== String(sheetId)) return;
      setSelection(normalizeChartSelection(nextSelection));
    },
    [currentSheet],
  );

  const handleCreate = useCallback(
    async (draft: Omit<ChartSpec, "id">) => {
      if (workspaceId == null || !workbook) throw new Error("当前工作簿不可用");
      await createChart(workspaceId, workbook.id, draft);
      await onWorkbookRefresh?.();
      await onWorkbookMutation?.();
    },
    [onWorkbookMutation, onWorkbookRefresh, workbook, workspaceId],
  );

  const dialog =
    workbook && currentSheet ? (
      <ChartInsertDialog
        open={open}
        workbookId={workbook.id}
        sheetId={currentSheet.id}
        sheetName={currentSheet.name}
        selection={selection}
        onClose={() => setOpen(false)}
        onCreate={handleCreate}
      />
    ) : null;

  return {
    dialog,
    handleSelectionChange,
    toolbarItems: [
      {
        key: "insert-chart",
        tooltip: "插入图表",
        icon: (
          <span aria-hidden="true" style={{ fontSize: 17, lineHeight: 1 }}>
            ▥
          </span>
        ),
        onClick: () => setOpen(true),
      },
    ],
  };
}
