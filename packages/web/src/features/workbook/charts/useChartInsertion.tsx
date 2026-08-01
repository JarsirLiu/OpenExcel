import type { WorkbookInstance } from "@fortune-sheet/react";
import type { ChartSpec } from "@openexcel/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkbookFull } from "@/api/workbooks";
import { ChartIcon } from "./ChartIcon";
import { ChartInsertDialog } from "./ChartInsertDialog";
import type { ChartMutation, ChartMutationPort } from "./chartMutation";
import { chartMutationPort } from "./chartMutationPort";
import { type FortuneSelection, normalizeChartSelection } from "./chartSelection";

type Props = {
  workspaceId: number | null;
  workbook: WorkbookFull | null;
  workbookRef: React.RefObject<WorkbookInstance | null>;
  currentSheetIndex: number;
  onChartMutation?: (mutation: ChartMutation) => Promise<void> | void;
  mutationPort?: ChartMutationPort;
};

function sameSelection(
  left: ReturnType<typeof normalizeChartSelection>,
  right: ReturnType<typeof normalizeChartSelection>,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.startRow === right.startRow &&
    left.endRow === right.endRow &&
    left.startCol === right.startCol &&
    left.endCol === right.endCol
  );
}

export function useChartInsertion({
  workspaceId,
  workbook,
  workbookRef,
  currentSheetIndex,
  onChartMutation,
  mutationPort = chartMutationPort,
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
    const normalized = normalizeChartSelection(nextSelection);
    setSelectionSheetId((current) => (current === sheetId ? current : sheetId));
    setSelection((current) => (sameSelection(current, normalized) ? current : normalized));
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
    const sheet = currentSheetRef.current;
    const activeSelection = instance?.getSelection()?.[0];

    if (sheet?.id != null && activeSelection) {
      applySelection(String(sheet.id), activeSelection);
    }
    setOpen(true);
  }, [applySelection, workbookRef]);

  const handleCreate = useCallback(
    async (draft: Omit<ChartSpec, "id">) => {
      if (workspaceId == null || !workbook) throw new Error("当前工作簿不可用");
      const chart = await mutationPort.create(workspaceId, workbook.id, draft);
      await onChartMutation?.({ kind: "created", chart });
    },
    [mutationPort, onChartMutation, workbook, workspaceId],
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
