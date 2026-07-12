import type { WorkbookInstance } from "@fortune-sheet/react";
import {
  celldataToExcel,
  extractSheetConfig,
  type FortuneCell,
  matrixToCelldata,
} from "@openexcel/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { applyDocumentLayout, applyDocumentOperations } from "@/api/documents";
import type { WorkbookFull } from "@/api/workbooks";
import { createSheet, deleteSheet, deleteWorkbook, updateSheetName } from "@/api/workbooks";
import type { WorkbookStructureUpdate } from "@/features/chat/hooks/useSheetPatchSync";
import { confirm } from "@/shared/lib";
import { buildDocumentOperations, valueKey } from "./documentSync";
import { toFortuneSheetData } from "./fortuneSheet";
import { useSheetActivation } from "./SheetActivationContext";
import { useWorkbookEditorSession } from "./useWorkbookEditorSession";

type UseExcelGridWorkspaceProps = {
  workspaceId: number | null;
  workbook: WorkbookFull | null;
  workbookRevision: number;
  currentSheetIndex: number;
  onSheetIndexChange?: (sheetIndex: number) => void;
  onWorkbookDelete?: (workbookId: number) => void;
  onWorkbookStructureChanged?: (update: WorkbookStructureUpdate) => void;
  onWorkbookRefresh?: () => Promise<void> | void;
};

export function useExcelGridWorkspace({
  workspaceId,
  workbook,
  workbookRevision,
  currentSheetIndex,
  onSheetIndexChange,
  onWorkbookDelete,
  onWorkbookStructureChanged,
  onWorkbookRefresh,
}: UseExcelGridWorkspaceProps) {
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStatusResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveChainRef = useRef(Promise.resolve());
  const lastSavedSnapshotRef = useRef<Record<number, string>>({});
  const lastSavedCelldataRef = useRef<Record<number, FortuneCell[]>>({});
  const lastSavedConfigRef = useRef<Record<number, unknown>>({});
  const lastSavedRevisionRef = useRef<Record<number, number>>({});
  const workbookRef = useRef<WorkbookInstance>(null);
  const { sheetData, sessionKey } = useWorkbookEditorSession(workbook, workbookRevision);
  const { registerActivateSheet } = useSheetActivation();

  const getSnapshot = useCallback((celldata: any[], config: any) => {
    return JSON.stringify({ celldata, config });
  }, []);

  useEffect(() => {
    if (!workbook) return;

    const nextSnapshots: Record<number, string> = {};
    workbook.sheets.forEach((sheet) => {
      const fd = toFortuneSheetData(sheet);
      nextSnapshots[sheet.id] = getSnapshot(fd.celldata, extractSheetConfig(fd));
      lastSavedCelldataRef.current[sheet.id] = fd.celldata;
      lastSavedConfigRef.current[sheet.id] = extractSheetConfig(fd);
      lastSavedRevisionRef.current[sheet.id] = sheet.documentRevision ?? 0;
    });

    lastSavedSnapshotRef.current = nextSnapshots;
  }, [workbook, getSnapshot]);

  useEffect(() => {
    if (!workbookRef.current) return;
    registerActivateSheet((index: number) => {
      workbookRef.current?.activateSheet({ index });
    });
    return () => registerActivateSheet(null);
  }, [registerActivateSheet]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (saveStatusResetRef.current) {
        clearTimeout(saveStatusResetRef.current);
      }
    };
  }, []);

  const syncSheetToServer = useCallback(
    async (celldata: any[], config: any) => {
      if (!workbook?.sheets[currentSheetIndex] || workspaceId == null) return;

      setSaveStatus("saving");
      try {
        const sheet = workbook.sheets[currentSheetIndex];
        const previousCelldata = lastSavedCelldataRef.current[sheet.id] ?? [];
        const operations = buildDocumentOperations(
          previousCelldata,
          celldata as FortuneCell[],
          sheet.columns.length > 0 ? 1 : 0,
        );
        let revision = lastSavedRevisionRef.current[sheet.id] ?? sheet.documentRevision ?? 0;
        if (operations.length > 0) {
          const result = await applyDocumentOperations(workspaceId, sheet.id, operations, revision);
          revision = result.revision;
        }
        const previousConfig = lastSavedConfigRef.current[sheet.id];
        if (valueKey(previousConfig) !== valueKey(config)) {
          const result = await applyDocumentLayout(workspaceId, sheet.id, config, revision);
          revision = result.revision;
        }
        lastSavedRevisionRef.current[sheet.id] = revision;
        setSaveStatus("saved");
        lastSavedSnapshotRef.current[sheet.id] = getSnapshot(celldata, config);
        lastSavedCelldataRef.current[sheet.id] = celldata as FortuneCell[];
        lastSavedConfigRef.current[sheet.id] = config;
        if (saveStatusResetRef.current) clearTimeout(saveStatusResetRef.current);
        saveStatusResetRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
      } catch (error) {
        setSaveStatus("idle");
        console.error("保存失败:", error);
      }
    },
    [currentSheetIndex, getSnapshot, workbook, workspaceId],
  );

  const scheduleSave = useCallback(
    (celldata: any[], config: any) => {
      if (!workbook?.sheets[currentSheetIndex]) return;
      const sheet = workbook.sheets[currentSheetIndex];
      if (!Array.isArray(celldata)) return;

      const snapshot = getSnapshot(celldata, config);
      if (lastSavedSnapshotRef.current[sheet.id] === snapshot) return;

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        saveChainRef.current = saveChainRef.current.then(() => syncSheetToServer(celldata, config));
      }, 500);
    },
    [currentSheetIndex, getSnapshot, syncSheetToServer, workbook],
  );

  const handleChange = useCallback(
    (data: any[]) => {
      if (!workbook || !Array.isArray(data)) return;
      const sheet = workbook.sheets[currentSheetIndex];
      if (!sheet) return;
      const fortuneSheet = data.find((s: any) => String(s.id) === String(sheet.id));
      if (!fortuneSheet) return;

      const cellMatrix = fortuneSheet.data;
      if (!Array.isArray(cellMatrix)) return;
      const celldata = matrixToCelldata(cellMatrix);
      const config = extractSheetConfig(fortuneSheet);
      scheduleSave(celldata, config);
    },
    [currentSheetIndex, scheduleSave, workbook],
  );

  const handleActivateSheet = useCallback(
    (sheetId: string) => {
      if (!workbook) return;
      const nextIndex = workbook.sheets.findIndex((sheet) => String(sheet.id) === sheetId);
      if (nextIndex >= 0) {
        onSheetIndexChange?.(nextIndex);
      }
    },
    [onSheetIndexChange, workbook],
  );

  const handleBeforeAddSheet = useCallback(
    (sheet: any) => {
      if (!workbook) return false;
      const name = typeof sheet?.name === "string" ? sheet.name : undefined;
      void (async () => {
        try {
          if (workspaceId == null) return;
          const result = await createSheet(workspaceId, workbook.id, { name });
          await onWorkbookStructureChanged?.({
            toolCallId: `ui-create-sheet:${workbook.id}:${result.id}`,
            kind: "sheet-created",
            workbookId: result.workbookId,
            sheetId: result.id,
            sheetNo: result.sheetNo,
            sheetName: result.name,
            order: result.order,
            sourceSheetId: null,
          });
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
      const deletedSheet = workbook.sheets.find((sheet) => sheet.id === numericSheetId);
      if (!deletedSheet) return false;

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
        } catch (error) {
          console.error("删除 Sheet 失败:", error);
          await onWorkbookRefresh?.();
        }
      })();
      return false;
    },
    [onWorkbookRefresh, onWorkbookStructureChanged, workbook, workspaceId],
  );

  const handleBeforeUpdateSheetName = useCallback(
    (sheetId: string, _oldName: string, newName: string) => {
      void (async () => {
        try {
          if (workspaceId == null) return;
          await updateSheetName(workspaceId, Number(sheetId), newName);
        } catch (error) {
          console.error("重命名 Sheet 失败:", error);
        }
      })();
      return true;
    },
    [workspaceId],
  );

  const handleDownload = useCallback(() => {
    const inst = workbookRef.current;
    if (!inst) return;
    const allSheets = inst.getAllSheets();
    if (!allSheets || allSheets.length === 0) return;

    const buf = celldataToExcel(
      (allSheets as any[]).map((sheet) => ({
        name: sheet.name,
        celldata: matrixToCelldata(sheet.data ?? []),
        config: extractSheetConfig(sheet),
        columnWidths: sheet.columnWidths ?? null,
        rowHeights: sheet.rowlen ?? sheet.rowHeights ?? null,
      })),
    );
    const blob = new Blob([buf], { type: "application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${workbook?.name ?? "export"}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [workbook]);

  const handleDeleteWorkbook = useCallback(async () => {
    if (!workbook) return;
    const ok = await confirm({
      title: "删除 Excel",
      message: `确认删除「${workbook.name}」？此操作不可恢复。`,
      confirmText: "删除",
      cancelText: "取消",
    });
    if (!ok) return;
    if (workspaceId == null) return;
    await deleteWorkbook(workspaceId, workbook.id);
    onWorkbookDelete?.(workbook.id);
  }, [onWorkbookDelete, workbook, workspaceId]);

  return {
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
  };
}
