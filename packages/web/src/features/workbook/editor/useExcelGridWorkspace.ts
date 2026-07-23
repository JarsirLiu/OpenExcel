import type { WorkbookInstance } from "@fortune-sheet/react";
import { extractSheetConfig, matrixToCelldata, type SheetCommand } from "@openexcel/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkbookFull } from "@/api/workbooks";
import {
  createSheet,
  deleteSheet,
  deleteWorkbook,
  executeSheetCommand,
  updateSheetName,
} from "@/api/workbooks";
import { SheetSaveScheduler } from "@/features/sync/sheetSaveScheduler";
import type { WorkbookStructureUpdate } from "@/features/sync/types";
import { confirm } from "@/shared/lib";
import { adaptFortuneSheetLayout, type SheetGridLayout } from "../layout/fortuneSheetLayout";
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
  onWorkbookMutation?: () => Promise<void> | void;
  onSheetRevisionChanged?: (sheetId: number, revision: number) => void;
};

function createMutationId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `web-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export function useExcelGridWorkspace({
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
}: UseExcelGridWorkspaceProps) {
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveStatusResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapshotRef = useRef<Record<number, string>>({});
  const saveSchedulerRef = useRef<SheetSaveScheduler | null>(null);
  if (!saveSchedulerRef.current) saveSchedulerRef.current = new SheetSaveScheduler();
  const workbookRef = useRef<WorkbookInstance>(null);
  const { sheetData, sessionKey } = useWorkbookEditorSession(workbook, workbookRevision);
  const { registerActivateSheet } = useSheetActivation();
  const layoutSessionKey = `${workbook?.id ?? "none"}:${sessionKey}`;
  const initialLayouts = useMemo(
    () =>
      Object.fromEntries(
        sheetData.map((sheet) => [String(sheet.id), adaptFortuneSheetLayout(sheet)]),
      ) as Record<string, SheetGridLayout>,
    [sheetData],
  );
  const [layoutState, setLayoutState] = useState<{
    sessionKey: string;
    bySheetId: Record<string, SheetGridLayout>;
  }>({ sessionKey: layoutSessionKey, bySheetId: initialLayouts });
  const layoutBySheetId =
    layoutState.sessionKey === layoutSessionKey ? layoutState.bySheetId : initialLayouts;

  const getSnapshot = useCallback((celldata: any[], config: any) => {
    return JSON.stringify({ celldata, config });
  }, []);

  useEffect(() => {
    if (!workbook) return;

    const nextSnapshots: Record<number, string> = {};
    workbook.sheets.forEach((sheet) => {
      const fd = toFortuneSheetData(sheet);
      nextSnapshots[sheet.id] = getSnapshot(fd.celldata, extractSheetConfig(fd));
    });

    lastSavedSnapshotRef.current = nextSnapshots;
    for (const sheet of workbook.sheets) {
      saveSchedulerRef.current?.setRevision(sheet.id, sheet.revision);
    }
  }, [workbook, getSnapshot]);

  useEffect(() => {
    setLayoutState({ sessionKey: layoutSessionKey, bySheetId: initialLayouts });
  }, [initialLayouts, layoutSessionKey]);

  useEffect(() => {
    if (!workbookRef.current) return;
    registerActivateSheet((index: number) => {
      workbookRef.current?.activateSheet({ index });
    });
    return () => registerActivateSheet(null);
  }, [registerActivateSheet]);

  useEffect(() => {
    if (!workbook || !workbookRef.current) return;
    const index = Math.max(0, Math.min(currentSheetIndex, workbook.sheets.length - 1));
    workbookRef.current.activateSheet({ index });
  }, [currentSheetIndex, workbook]);

  useEffect(() => {
    return () => {
      saveSchedulerRef.current?.dispose();
      if (saveStatusResetRef.current) {
        clearTimeout(saveStatusResetRef.current);
      }
    };
  }, []);

  const syncSheetToServer = useCallback(
    async (
      sheetId: number,
      celldata: any[],
      config: any,
      baseRevision: number,
      mutationId: string,
    ) => {
      if (workspaceId == null) return { revision: baseRevision };

      setSaveStatus("saving");
      try {
        const command: SheetCommand = {
          kind: "replaceSnapshot",
          mutationId,
          sheetId,
          baseRevision,
          snapshot: {
            celldata,
            config: config && typeof config === "object" && !Array.isArray(config) ? config : null,
          },
        };
        const result = await executeSheetCommand(workspaceId, command);
        await onWorkbookMutation?.();
        setSaveStatus("saved");
        lastSavedSnapshotRef.current[sheetId] = getSnapshot(celldata, config);
        onSheetRevisionChanged?.(sheetId, result.revision);
        if (saveStatusResetRef.current) clearTimeout(saveStatusResetRef.current);
        saveStatusResetRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
        return result;
      } catch (error) {
        setSaveStatus("idle");
        console.error("保存失败:", error);
        await onWorkbookRefresh?.();
        throw error;
      }
    },
    [getSnapshot, onSheetRevisionChanged, onWorkbookMutation, onWorkbookRefresh, workspaceId],
  );

  const scheduleSave = useCallback(
    (celldata: any[], config: any) => {
      if (!workbook?.sheets[currentSheetIndex]) return;
      const sheet = workbook.sheets[currentSheetIndex];
      if (!Array.isArray(celldata)) return;

      const snapshot = getSnapshot(celldata, config);
      if (lastSavedSnapshotRef.current[sheet.id] === snapshot) return;

      const mutationId = createMutationId();
      saveSchedulerRef.current?.schedule(sheet.id, sheet.revision, (baseRevision) =>
        syncSheetToServer(sheet.id, celldata, config, baseRevision, mutationId),
      );
    },
    [currentSheetIndex, getSnapshot, syncSheetToServer, workbook],
  );

  const handleChange = useCallback(
    (data: any[]) => {
      if (!workbook || !Array.isArray(data)) return;

      setLayoutState((current) => {
        const bySheetId =
          current.sessionKey === layoutSessionKey
            ? { ...current.bySheetId }
            : { ...initialLayouts };
        for (const fortuneSheet of data) {
          if (fortuneSheet?.id == null) continue;
          bySheetId[String(fortuneSheet.id)] = adaptFortuneSheetLayout(fortuneSheet);
        }
        return { sessionKey: layoutSessionKey, bySheetId };
      });

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
    [currentSheetIndex, initialLayouts, layoutSessionKey, scheduleSave, workbook],
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
          await onWorkbookMutation?.();
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
    [onWorkbookMutation, onWorkbookRefresh, onWorkbookStructureChanged, workbook, workspaceId],
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
          await onWorkbookMutation?.();
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
    if (!ok) return;
    if (workspaceId == null) return;
    await deleteWorkbook(workspaceId, workbook.id);
    await onWorkbookMutation?.();
    onWorkbookDelete?.(workbook.id);
  }, [onWorkbookDelete, onWorkbookMutation, workbook, workspaceId]);

  return {
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
  };
}
