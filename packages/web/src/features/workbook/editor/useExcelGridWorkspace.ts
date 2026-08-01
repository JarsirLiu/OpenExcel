import type { WorkbookInstance } from "@fortune-sheet/react";
import { extractSheetConfig } from "@openexcel/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkbookFull } from "@/api/workbooks";
import { createSheet, deleteSheet, deleteWorkbook, updateSheetName } from "@/api/workbooks";
import type { SheetSnapshotForSave } from "@/features/sync/sheetChunkSnapshot";
import type {
  SheetContentChangeHandler,
  SheetEditorChange,
} from "@/features/sync/sheetEditorChange";
import type { WorkbookStructureUpdate } from "@/features/sync/types";
import { useSheetSaveController } from "@/features/sync/useSheetSaveController";
import { normalizeSheetIndex } from "@/features/workspace/sheetIndex";
import { confirm, toast } from "@/shared/lib";
import { adaptFortuneSheetLayout, type SheetGridLayout } from "../layout/fortuneSheetLayout";
import { findSheetIndexById } from "../sheetIdentity";
import { toFortuneSheetData } from "./fortuneSheet";
import { adaptFortuneSheetChange } from "./fortuneSheetChangeAdapter";
import {
  collectFortuneSheetOpHints,
  type FortuneSheetOp,
  type FortuneSheetOpHint,
} from "./fortuneSheetOps";
import { useSheetActivation } from "./SheetActivationContext";
import { createSheetEditorSnapshot, type SheetEditorSnapshot } from "./sheetMutationFromDiff";
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
  onSheetContentChanged?: SheetContentChangeHandler;
  sheetLoaded: boolean;
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
  onWorkbookMutation,
  onSheetRevisionChanged,
  onSheetContentChanged,
  sheetLoaded,
}: UseExcelGridWorkspaceProps) {
  const deletingSheetRef = useRef(false);
  const workbookRef = useRef<WorkbookInstance>(null);
  const liveWorkbookRef = useRef(workbook);
  const [contentVersion, setContentVersion] = useState(0);
  const { sheetData, sessionKey } = useWorkbookEditorSession(workbook, workbookRevision);
  const { registerActivateSheet } = useSheetActivation();
  const applyDocumentChange = useCallback(
    (change: SheetEditorChange) => {
      const next = onSheetContentChanged?.(change);
      if (next) {
        liveWorkbookRef.current = next;
        setContentVersion((version) => version + 1);
      }
      return next;
    },
    [onSheetContentChanged],
  );
  const {
    saveStatus,
    reset: resetSave,
    schedule: scheduleSave,
  } = useSheetSaveController({
    workspaceId,
    sheetLoaded,
    onRevisionChanged: onSheetRevisionChanged,
    onRebasedChange: applyDocumentChange,
  });
  const layoutSessionKey = `${workbook?.id ?? "none"}:${sessionKey}`;
  const activeSheetIndex = normalizeSheetIndex(currentSheetIndex, workbook?.sheets.length ?? 0);
  const workbookStateRef = useRef(workbook);
  const activeSheetIndexRef = useRef(activeSheetIndex);
  const sheetLoadedRef = useRef(sheetLoaded);
  const pendingOpHintsRef = useRef<Map<number, FortuneSheetOpHint>>(new Map());
  const editorSnapshotsRef = useRef<Map<number, SheetEditorSnapshot>>(new Map());
  const editorSessionRef = useRef(sessionKey);
  useEffect(() => {
    liveWorkbookRef.current = workbook;
  }, [workbook]);
  workbookStateRef.current = liveWorkbookRef.current ?? workbook;
  activeSheetIndexRef.current = activeSheetIndex;
  sheetLoadedRef.current = sheetLoaded;
  if (editorSessionRef.current !== sessionKey) {
    editorSessionRef.current = sessionKey;
    pendingOpHintsRef.current.clear();
    editorSnapshotsRef.current.clear();
  }
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
  useEffect(() => {
    if (!workbook) return;

    const editorSnapshots = new Map<number, SheetEditorSnapshot>();
    workbook.sheets.forEach((sheet) => {
      const fd = toFortuneSheetData(sheet);
      const snapshot = {
        celldata: fd.celldata,
        config: extractSheetConfig(fd),
      } satisfies SheetSnapshotForSave;
      editorSnapshots.set(sheet.id, createSheetEditorSnapshot(snapshot.celldata, snapshot.config));
      resetSave(sheet.id, snapshot, sheet.revision);
    });
    editorSnapshotsRef.current = editorSnapshots;
    pendingOpHintsRef.current.clear();
  }, [resetSave, workbook?.id, workbookRevision]);

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
    const index = normalizeSheetIndex(currentSheetIndex, workbook.sheets.length);
    workbookRef.current.activateSheet({ index });
  }, [currentSheetIndex, sessionKey]);

  const handleChange = useCallback(
    (data: any[]) => {
      const currentWorkbook = workbookStateRef.current;
      const currentSheetIndex = activeSheetIndexRef.current;
      if (!sheetLoadedRef.current || !currentWorkbook || !Array.isArray(data)) return;

      const sheet = currentWorkbook.sheets[currentSheetIndex];
      if (!sheet) return;
      const hint = pendingOpHintsRef.current.get(sheet.id);
      pendingOpHintsRef.current.delete(sheet.id);

      if (!hint || hint.requiresSnapshot) {
        setLayoutState((current) => {
          const bySheetId =
            current.sessionKey === layoutSessionKey
              ? { ...current.bySheetId }
              : { ...initialLayouts };
          let changed = current.sessionKey !== layoutSessionKey;
          for (const fortuneSheet of data) {
            if (fortuneSheet?.id == null) continue;
            const key = String(fortuneSheet.id);
            const nextLayout = adaptFortuneSheetLayout(fortuneSheet);
            if (JSON.stringify(bySheetId[key]) !== JSON.stringify(nextLayout)) {
              bySheetId[key] = nextLayout;
              changed = true;
            }
          }
          return changed ? { sessionKey: layoutSessionKey, bySheetId } : current;
        });
      }

      const fortuneSheet = data.find((s: any) => String(s.id) === String(sheet.id));
      if (!fortuneSheet) {
        return;
      }

      const cellMatrix = fortuneSheet.data;
      if (!Array.isArray(cellMatrix)) {
        return;
      }
      const config = extractSheetConfig(fortuneSheet);
      const previousSnapshot = editorSnapshotsRef.current.get(sheet.id);
      if (!previousSnapshot) return;
      const { snapshot: currentEditorSnapshot, change } = adaptFortuneSheetChange({
        sheetId: sheet.id,
        data: cellMatrix,
        config,
        previous: previousSnapshot,
        hint,
      });
      editorSnapshotsRef.current.set(sheet.id, currentEditorSnapshot);
      if (change) {
        applyDocumentChange(change);
        scheduleSave(change);
      }
    },
    [applyDocumentChange, initialLayouts, layoutSessionKey, scheduleSave],
  );

  const handleOp = useCallback((ops: readonly FortuneSheetOp[]) => {
    const currentWorkbook = workbookStateRef.current;
    const currentSheetIndex = activeSheetIndexRef.current;
    if (!currentWorkbook) return;
    const activeSheet = currentWorkbook.sheets[currentSheetIndex];
    if (!activeSheet) return;
    const hints = collectFortuneSheetOpHints(ops, activeSheet.id);
    for (const [sheetId, hint] of hints) {
      const current = pendingOpHintsRef.current.get(sheetId);
      if (!current) {
        pendingOpHintsRef.current.set(sheetId, hint);
        continue;
      }
      current.requiresSnapshot ||= hint.requiresSnapshot;
      for (const cellKey of hint.changedCellKeys) current.changedCellKeys.add(cellKey);
    }
  }, []);

  const handleActivateSheet = useCallback(
    (sheetId: string | number) => {
      const currentWorkbook = workbookStateRef.current;
      if (!currentWorkbook) return;
      const nextIndex = findSheetIndexById(currentWorkbook.sheets, sheetId);
      if (nextIndex >= 0) {
        onSheetIndexChange?.(nextIndex);
      }
    },
    [onSheetIndexChange],
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
    if (!ok) return;
    if (workspaceId == null) return;
    await deleteWorkbook(workspaceId, workbook.id);
    await onWorkbookMutation?.();
    onWorkbookDelete?.(workbook.id);
  }, [onWorkbookDelete, onWorkbookMutation, workbook, workspaceId]);

  return {
    saveStatus,
    workbookRef,
    liveWorkbook: liveWorkbookRef.current,
    contentVersion,
    sheetData,
    sessionKey,
    layoutBySheetId,
    handleChange,
    handleOp,
    handleActivateSheet,
    handleBeforeAddSheet,
    handleBeforeDeleteSheet,
    handleBeforeUpdateSheetName,
    handleDeleteWorkbook,
  };
}
