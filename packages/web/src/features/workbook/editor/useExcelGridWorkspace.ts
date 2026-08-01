import type { WorkbookInstance } from "@fortune-sheet/react";
import {
  extractSheetConfig,
  type FortuneCell,
  matrixToCelldata,
  normalizeFortuneCellValue,
  type SheetCommand,
  type SheetConfig,
} from "@openexcel/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkbookFull } from "@/api/workbooks";
import {
  createSheet,
  deleteSheet,
  deleteWorkbook,
  executeSheetCommand,
  fetchSheet,
  SheetRevisionConflictError,
  updateSheetName,
} from "@/api/workbooks";
import type { SheetSnapshotForSave } from "@/features/sync/sheetChunkSnapshot";
import { SheetSaveCoordinator } from "@/features/sync/sheetSaveCoordinator";
import type { WorkbookStructureUpdate } from "@/features/sync/types";
import { normalizeSheetIndex } from "@/features/workspace/sheetIndex";
import { confirm, toast } from "@/shared/lib";
import { adaptFortuneSheetLayout, type SheetGridLayout } from "../layout/fortuneSheetLayout";
import { findSheetIndexById } from "../sheetIdentity";
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
  onSheetContentChanged?: (
    sheetId: number,
    celldata: FortuneCell[],
    config: SheetConfig | null,
  ) => void;
  sheetLoaded: boolean;
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
  onSheetContentChanged,
  sheetLoaded,
}: UseExcelGridWorkspaceProps) {
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveStatusResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveCoordinatorRef = useRef<SheetSaveCoordinator | null>(null);
  const deletingSheetRef = useRef(false);
  if (!saveCoordinatorRef.current) saveCoordinatorRef.current = new SheetSaveCoordinator();
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
  const activeSheetIndex = normalizeSheetIndex(currentSheetIndex, workbook?.sheets.length ?? 0);

  useEffect(() => {
    if (!workbook) return;

    workbook.sheets.forEach((sheet) => {
      const fd = toFortuneSheetData(sheet);
      saveCoordinatorRef.current?.reset(
        sheet.id,
        {
          celldata: fd.celldata,
          config: extractSheetConfig(fd),
        },
        sheet.revision,
      );
    });
  }, [workbook?.id, workbookRevision]);

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

  useEffect(() => {
    return () => {
      saveCoordinatorRef.current?.dispose();
      if (saveStatusResetRef.current) {
        clearTimeout(saveStatusResetRef.current);
      }
    };
  }, []);

  const syncSheetToServer = useCallback(
    async (
      sheetId: number,
      request: {
        baseRevision: number;
        config: SheetConfig | null;
        chunks: Array<{ chunkRow: number; chunkCol: number; payload: string | null }>;
      },
    ) => {
      if (workspaceId == null) {
        return { revision: request.baseRevision };
      }

      const mutationId = createMutationId();
      setSaveStatus("saving");
      try {
        const command: SheetCommand = {
          kind: "replaceChunks",
          mutationId,
          sheetId,
          baseRevision: request.baseRevision,
          config: request.config as Record<string, unknown> | null,
          chunks: request.chunks,
        };
        const result = await executeSheetCommand(workspaceId, command);
        setSaveStatus("saved");
        onSheetRevisionChanged?.(sheetId, result.revision);
        if (saveStatusResetRef.current) clearTimeout(saveStatusResetRef.current);
        saveStatusResetRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
        return result;
      } catch (error) {
        setSaveStatus("idle");
        console.error("保存失败:", error);
        throw error;
      }
    },
    [onSheetRevisionChanged, workspaceId],
  );

  const scheduleSave = useCallback(
    (celldata: any[], config: any) => {
      if (!sheetLoaded) {
        return;
      }
      if (!workbook?.sheets[activeSheetIndex]) {
        return;
      }
      const sheet = workbook.sheets[activeSheetIndex];
      if (!sheet) {
        return;
      }
      if (!Array.isArray(celldata)) {
        return;
      }

      const normalizedConfig =
        config && typeof config === "object" && !Array.isArray(config) ? config : null;
      const snapshot: SheetSnapshotForSave = {
        celldata: celldata as FortuneCell[],
        config: normalizedConfig,
      };
      const onSuccess = (result: { revision: number }) => {
        setSaveStatus("saved");
        onSheetRevisionChanged?.(sheet.id, result.revision);
        if (saveStatusResetRef.current) clearTimeout(saveStatusResetRef.current);
        saveStatusResetRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
      };
      let onError: (error: unknown) => void;
      onError = (error) => {
        if (!(error instanceof SheetRevisionConflictError) || workspaceId == null) {
          setSaveStatus("idle");
          console.error("保存失败:", error);
          return;
        }
        void fetchSheet(workspaceId, sheet.id)
          .then((remote) => {
            const rebased = saveCoordinatorRef.current?.rebase(
              sheet.id,
              { celldata: (remote.uploadedData ?? []) as FortuneCell[], config: remote.config },
              remote.revision,
            );
            if (!rebased) return;
            saveCoordinatorRef.current?.schedule(
              sheet.id,
              rebased,
              (request) => syncSheetToServer(sheet.id, request),
              { onSuccess, onError },
            );
          })
          .catch((refreshError) => {
            setSaveStatus("idle");
            console.error("保存冲突合并失败:", refreshError);
          });
      };
      saveCoordinatorRef.current?.schedule(
        sheet.id,
        snapshot,
        (request) => syncSheetToServer(sheet.id, request),
        { onSuccess, onError },
      );
    },
    [activeSheetIndex, onSheetRevisionChanged, sheetLoaded, syncSheetToServer, workbook],
  );

  const handleChange = useCallback(
    (data: any[]) => {
      if (!sheetLoaded || !workbook || !Array.isArray(data)) return;

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

      const sheet = workbook.sheets[activeSheetIndex];
      if (!sheet) return;
      const fortuneSheet = data.find((s: any) => String(s.id) === String(sheet.id));
      if (!fortuneSheet) {
        return;
      }

      const cellMatrix = fortuneSheet.data;
      if (!Array.isArray(cellMatrix)) {
        return;
      }
      const celldata = matrixToCelldata(cellMatrix).map((cell) => ({
        ...cell,
        v: normalizeFortuneCellValue(cell.v),
      }));
      const config = extractSheetConfig(fortuneSheet);
      onSheetContentChanged?.(sheet.id, celldata, config);
      scheduleSave(celldata, config);
    },
    [
      activeSheetIndex,
      initialLayouts,
      layoutSessionKey,
      onSheetContentChanged,
      scheduleSave,
      sheetLoaded,
      workbook,
    ],
  );

  const handleActivateSheet = useCallback(
    (sheetId: string | number) => {
      if (!workbook) return;
      const nextIndex = findSheetIndexById(workbook.sheets, sheetId);
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
    handleActivateSheet,
    handleBeforeAddSheet,
    handleBeforeDeleteSheet,
    handleBeforeUpdateSheetName,
    handleDeleteWorkbook,
  };
}
