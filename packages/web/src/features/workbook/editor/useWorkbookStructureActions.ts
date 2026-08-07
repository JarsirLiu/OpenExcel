import { useCallback, useRef } from "react";
import { deleteSheet, deleteWorkbook, updateSheetName, type WorkbookFull } from "@/api/workbooks";
import type { WorkbookStructureUpdate } from "@/features/sync/types";
import { confirm, toast } from "@/shared/lib";
import { createSheetFromEditor } from "./createSheetFromEditor";

type Props = {
  workspaceId: number | null;
  workbook: WorkbookFull | null;
  onWorkbookDelete?: (workbookId: number) => void;
  onWorkbookStructureChanged?: (update: WorkbookStructureUpdate) => void;
  onWorkbookRefresh?: () => Promise<void> | void;
  onWorkbookMutation?: () => Promise<void> | void;
};

export function useWorkbookStructureActions({
  workspaceId,
  workbook,
  onWorkbookDelete,
  onWorkbookStructureChanged,
  onWorkbookRefresh,
  onWorkbookMutation,
}: Props) {
  const deletingSheetRef = useRef(false);

  const handleBeforeAddSheet = useCallback(
    (sheet: any) => {
      if (!workbook) return false;
      const name = typeof sheet?.name === "string" ? sheet.name : undefined;
      void (async () => {
        try {
          if (workspaceId == null) return;
          const update = await createSheetFromEditor({
            workspaceId,
            workbookId: workbook.id,
            name,
          });
          await onWorkbookStructureChanged?.(update);
        } catch (error) {
          console.error("创建 Sheet 失败:", error);
          await onWorkbookRefresh?.();
        }
      })();
      return false;
    },
    [onWorkbookRefresh, onWorkbookStructureChanged, workbook, workspaceId],
  );

  const handleBeforeDeleteSheet = useCallback(
    (sheetId: string | number) => {
      if (!workbook) return false;
      const numericSheetId = Number(sheetId);
      if (!Number.isInteger(numericSheetId)) return false;
      const deletedSheet = workbook.sheets.find((sheet) => sheet.id === numericSheetId);
      if (!deletedSheet) return false;
      if (deletingSheetRef.current) return false;
      deletingSheetRef.current = true;

      void (async () => {
        try {
          if (workspaceId == null) return;
          await deleteSheet(workspaceId, workbook.id, numericSheetId);
          await onWorkbookStructureChanged?.({
            toolCallId: `ui-delete-sheet:${workbook.id}:${numericSheetId}`,
            kind: "sheet-deleted",
            workbookId: workbook.id,
            sheetId: numericSheetId,
            sheetNo: deletedSheet.sheetNo,
            order: deletedSheet.order,
          });
          try {
            await onWorkbookMutation?.();
          } catch (error) {
            console.error("删除 Sheet 后刷新工作簿状态失败:", error);
          }
          toast({ message: "Sheet 已删除", variant: "success" });
        } catch (error) {
          console.error("删除 Sheet 失败:", error);
          toast({
            message: error instanceof Error ? error.message : "删除 Sheet 失败",
            variant: "error",
          });
          await onWorkbookRefresh?.();
        } finally {
          deletingSheetRef.current = false;
        }
      })();
      return false;
    },
    [onWorkbookMutation, onWorkbookRefresh, onWorkbookStructureChanged, workbook, workspaceId],
  );

  const handleBeforeUpdateSheetName = useCallback(
    (sheetId: string, _oldName: string, newName: string) => {
      void (async () => {
        try {
          if (workspaceId == null) return;
          await updateSheetName(workspaceId, Number(sheetId), newName);
          await onWorkbookMutation?.();
        } catch (error) {
          console.error("重命名 Sheet 失败:", error);
        }
      })();
      return true;
    },
    [onWorkbookMutation, workspaceId],
  );

  const handleDeleteWorkbook = useCallback(async () => {
    if (!workbook) return;
    const ok = await confirm({
      title: "删除 Excel",
      message: `确认删除「${workbook.name}」？此操作不可恢复。`,
      confirmText: "删除",
      cancelText: "取消",
    });
    if (!ok || workspaceId == null) return;
    await deleteWorkbook(workspaceId, workbook.id);
    await onWorkbookMutation?.();
    onWorkbookDelete?.(workbook.id);
  }, [onWorkbookDelete, onWorkbookMutation, workbook, workspaceId]);

  return {
    handleBeforeAddSheet,
    handleBeforeDeleteSheet,
    handleBeforeUpdateSheetName,
    handleDeleteWorkbook,
  };
}
