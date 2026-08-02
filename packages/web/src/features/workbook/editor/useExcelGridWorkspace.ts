import type { WorkbookInstance } from "@fortune-sheet/react";
import {
  extractSheetConfig,
  type SheetChangeDelta,
  type SheetChangeVersion,
} from "@openexcel/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkbookFull } from "@/api/workbooks";
import { createSheet, deleteSheet, deleteWorkbook, updateSheetName } from "@/api/workbooks";
import type { SheetSnapshotForSave } from "@/features/sync/sheetChunkSnapshot";
import type {
  CommittedSheetMutationHandler,
  SheetContentChangeHandler,
  SheetEditorChange,
} from "@/features/sync/sheetEditorChange";
import type { WorkbookStructureUpdate } from "@/features/sync/types";
import { useSheetSaveController } from "@/features/sync/useSheetSaveController";
import { normalizeSheetIndex } from "@/features/workspace/sheetIndex";
import type { WorkbookDocumentStore } from "@/features/workspace/WorkbookDocumentStore";
import { confirm, toast } from "@/shared/lib";
import { adaptFortuneSheetLayout, type SheetGridLayout } from "../layout/fortuneSheetLayout";
import { findSheetIndexById } from "../sheetIdentity";
import { FortuneSheetEventAdapter } from "./FortuneSheetEventAdapter";
import { toFortuneSheetData } from "./fortuneSheet";
import { planFortuneSheetMutation } from "./fortuneSheetMutationBridge";
import type { FortuneSheetOp } from "./fortuneSheetOps";
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
  onSheetRevisionChanged?: (
    sheetId: number,
    revision: number,
    persistedThroughVersion?: number,
  ) => void;
  onSheetContentChanged?: SheetContentChangeHandler;
  onRegisterCommittedSheetMutation?: (handler: CommittedSheetMutationHandler | null) => void;
  onEnsureAllSheetsLoaded?: () => Promise<WorkbookFull | null>;
  documentStore: WorkbookDocumentStore;
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
  onRegisterCommittedSheetMutation,
  onEnsureAllSheetsLoaded,
  documentStore,
  sheetLoaded,
}: UseExcelGridWorkspaceProps) {
  const deletingSheetRef = useRef(false);
  const workbookRef = useRef<WorkbookInstance>(null);
  const { sheetData, sessionKey } = useWorkbookEditorSession(workbook, workbookRevision);
  const { registerActivateSheet } = useSheetActivation();
  const eventAdapterRef = useRef<FortuneSheetEventAdapter | null>(null);
  const saveSnapshotsRef = useRef<Map<number, SheetSnapshotForSave>>(new Map());
  const saveLifecycleRef = useRef<{
    workbookId: number | null;
    bySheetId: Map<number, string>;
  }>({ workbookId: null, bySheetId: new Map() });
  if (!eventAdapterRef.current) eventAdapterRef.current = new FortuneSheetEventAdapter();
  const applyDocumentChange = useCallback(
    (change: SheetEditorChange) => {
      return onSheetContentChanged?.(change);
    },
    [onSheetContentChanged],
  );
  const {
    saveStatus,
    acceptExternalMutation,
    reset: resetSave,
    schedule: scheduleSave,
  } = useSheetSaveController({
    workspaceId,
    sheetLoaded,
    getDocumentVersion: documentStore.getSheetChangeVersion,
    onRevisionChanged: onSheetRevisionChanged,
    onRebasedChange: applyDocumentChange,
  });
  const layoutSessionKey = `${workbook?.id ?? "none"}:${sessionKey}`;
  const activeSheetIndex = normalizeSheetIndex(currentSheetIndex, workbook?.sheets.length ?? 0);
  const workbookStateRef = useRef(workbook);
  const activeSheetIndexRef = useRef(activeSheetIndex);
  const sheetLoadedRef = useRef(sheetLoaded);
  const editorSessionRef = useRef(sessionKey);
  const pendingCommittedMutationRef = useRef<{
    sheetId: number;
    token: object;
    resolve: () => void;
    reject: (error: unknown) => void;
  } | null>(null);
  const committedMutationQueueRef = useRef(Promise.resolve());
  workbookStateRef.current = documentStore.getSnapshot() ?? workbook;
  activeSheetIndexRef.current = activeSheetIndex;
  sheetLoadedRef.current = sheetLoaded;
  if (editorSessionRef.current !== sessionKey) {
    editorSessionRef.current = sessionKey;
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
    saveSnapshotsRef.current = workbook
      ? (eventAdapterRef.current?.reset(sheetData) ?? new Map())
      : new Map();
  }, [sheetData, workbook?.id, workbookRevision]);

  const saveLifecycleKey = workbook
    ? `${workbook.id}:${workbook.sheets
        .map((sheet) => `${sheet.id}:${sheet.loaded === false ? "unloaded" : "loaded"}`)
        .join(",")}`
    : "none";

  useEffect(() => {
    if (!workbook) {
      saveLifecycleRef.current = { workbookId: null, bySheetId: new Map() };
      return;
    }

    const previous = saveLifecycleRef.current;
    const workbookChanged = previous.workbookId !== workbook.id;
    const nextBySheetId = new Map<number, string>();
    for (const sheet of workbook.sheets) {
      const lifecycle = `${sheet.id}:${sheet.loaded === false ? "unloaded" : "loaded"}`;
      nextBySheetId.set(sheet.id, lifecycle);
      if (workbookChanged || previous.bySheetId.get(sheet.id) !== lifecycle) {
        const snapshot = saveSnapshotsRef.current.get(sheet.id);
        if (snapshot) resetSave(sheet.id, snapshot, sheet.revision);
      }
    }
    saveLifecycleRef.current = { workbookId: workbook.id, bySheetId: nextBySheetId };
  }, [resetSave, saveLifecycleKey]);

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
      const eventAdapter = eventAdapterRef.current;
      if (!eventAdapter) return;
      const results = eventAdapter.handleChange(data, sheet.id);
      if (results.length === 0) return;

      const layoutChanged = results.some(
        ({ change }) =>
          change?.kind === "snapshot" ||
          (change?.kind === "patch" && change.mutation.config !== undefined),
      );
      if (layoutChanged) {
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

      for (const result of results) {
        if (!result.change) continue;
        applyDocumentChange(result.change);
        scheduleSave(result.change, documentStore.getSheetChangeVersion(result.sheetId));
      }

      const pending = pendingCommittedMutationRef.current;
      if (pending && results.some((result) => result.sheetId === pending.sheetId)) {
        pendingCommittedMutationRef.current = null;
        pending.resolve();
      }
    },
    [applyDocumentChange, documentStore, initialLayouts, layoutSessionKey, scheduleSave],
  );

  const handleCommittedSheetMutation = useCallback<CommittedSheetMutationHandler>(
    (sheetId: number, delta: SheetChangeDelta, version: SheetChangeVersion) => {
      const run = async () => {
        const initialWorkbook = workbookStateRef.current;
        const unloadedSheetIds = new Set(
          initialWorkbook?.sheets
            .filter((sheet) => sheet.loaded === false)
            .map((sheet) => sheet.id) ?? [],
        );
        const loadedWorkbook = await onEnsureAllSheetsLoaded?.();
        const currentWorkbook = loadedWorkbook ?? workbookStateRef.current;
        if (initialWorkbook?.id !== currentWorkbook?.id) {
          throw new Error("The workbook changed while loading sheets for the committed mutation");
        }
        if (currentWorkbook?.sheets.some((item) => item.loaded === false)) {
          throw new Error(
            "All workbook sheets must be loaded before applying a committed mutation",
          );
        }
        const sheet = currentWorkbook?.sheets.find((item) => item.id === sheetId);
        const instance = workbookRef.current;
        const eventAdapter = eventAdapterRef.current;
        if (!currentWorkbook || !sheet || !instance || !eventAdapter) {
          throw new Error("The active FortuneSheet editor is not ready");
        }

        if (loadedWorkbook && unloadedSheetIds.size > 0) {
          const newlyLoadedData = loadedWorkbook.sheets
            .filter((loadedSheet) => unloadedSheetIds.has(loadedSheet.id))
            .map(toFortuneSheetData);
          for (const loadedSheet of newlyLoadedData) {
            const loadedSheetId = Number(loadedSheet.id);
            const snapshot = {
              celldata: loadedSheet.celldata,
              config: extractSheetConfig(loadedSheet),
            };
            eventAdapter.replaceSheetSnapshot(loadedSheetId, snapshot);
            saveSnapshotsRef.current.set(loadedSheetId, snapshot);
          }
          if (newlyLoadedData.length > 0) {
            instance.updateSheet(
              newlyLoadedData as unknown as Parameters<typeof instance.updateSheet>[0],
            );
          }
        }

        const plan = planFortuneSheetMutation(sheet, delta);
        const rawChange: SheetEditorChange | null = plan.patch
          ? { kind: "patch", sheetId, mutation: plan.patch }
          : null;
        if (rawChange) applyDocumentChange(rawChange);
        onSheetRevisionChanged?.(sheetId, version.revision);
        eventAdapter.replaceSheetSnapshot(sheetId, plan.snapshot);
        saveSnapshotsRef.current.set(sheetId, plan.snapshot);
        acceptExternalMutation(sheetId, delta, version.revision);

        await new Promise<void>((resolve, reject) => {
          const token = {};
          const timeout = setTimeout(() => {
            if (pendingCommittedMutationRef.current?.token !== token) return;
            pendingCommittedMutationRef.current = null;
            reject(new Error("FortuneSheet formula recalculation timed out"));
          }, 5000);
          pendingCommittedMutationRef.current = {
            sheetId,
            token,
            resolve: () => {
              clearTimeout(timeout);
              resolve();
            },
            reject: (error) => {
              clearTimeout(timeout);
              reject(error);
            },
          };
          try {
            instance.batchCallApis(plan.apiCalls);
          } catch (error) {
            clearTimeout(timeout);
            pendingCommittedMutationRef.current = null;
            reject(error);
          }
        });
      };

      const queued = committedMutationQueueRef.current.then(run, run);
      committedMutationQueueRef.current = queued.catch(() => undefined);
      return queued;
    },
    [acceptExternalMutation, applyDocumentChange, onEnsureAllSheetsLoaded, onSheetRevisionChanged],
  );

  useEffect(() => {
    onRegisterCommittedSheetMutation?.(handleCommittedSheetMutation);
    return () => onRegisterCommittedSheetMutation?.(null);
  }, [handleCommittedSheetMutation, onRegisterCommittedSheetMutation]);

  const handleOp = useCallback((ops: readonly FortuneSheetOp[]) => {
    const currentWorkbook = workbookStateRef.current;
    const currentSheetIndex = activeSheetIndexRef.current;
    if (!currentWorkbook) return;
    const activeSheet = currentWorkbook.sheets[currentSheetIndex];
    if (!activeSheet) return;
    eventAdapterRef.current?.handleOp(ops, activeSheet.id);
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
