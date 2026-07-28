import type { SheetChangeDelta, SheetChangeVersion } from "@openexcel/core";
import { useCallback, useEffect, useState } from "react";
import { listCharts } from "@/api/charts";
import type { WorkbookFull } from "@/api/workbooks";
import type { WorkbookStructureUpdate } from "@/features/sync/types";
import type { ChartMutation } from "@/features/workbook/charts/chartMutation";
import { toast } from "@/shared/lib";
import { patchWorkbookWithDelta } from "../workbook/utils/patchWorkbook";
import { getSheetIndexAfterDeletion, normalizeSheetIndex } from "./sheetIndex";
import { useSheetNavigation } from "./useSheetNavigation";
import {
  useWorkbookCatalog,
  type WorkbookEntryMode,
  type WorkbookInitial,
} from "./useWorkbookCatalog";
import { useWorkbookDocument } from "./useWorkbookDocument";

const MAX_IMPORT_WORKBOOKS = 20;

function loadedSheetIds(workbook: WorkbookFull | null): number[] | undefined {
  if (!workbook) return undefined;
  const ids = workbook.sheets.filter((sheet) => sheet.loaded !== false).map((sheet) => sheet.id);
  return ids.length > 0 ? ids : undefined;
}

export function useWorkspaceView(
  workspaceId: number | null,
  initial?: WorkbookInitial,
  entryMode: WorkbookEntryMode = "welcome",
) {
  const {
    workbooks,
    workbookIdx,
    activeWorkbookId,
    switchWorkbook,
    loading,
    transition,
    retryTransition,
    commitWorkbook,
    failWorkbookTransition,
    clearActiveWorkbook,
    refreshCatalog,
    requestWorkbookById,
    createWorkbookInCatalog,
    deleteWorkbookInCatalog,
    importWorkbooksInCatalog,
    renameWorkbookInCatalog,
  } = useWorkbookCatalog(workspaceId, initial, entryMode);
  const {
    currentWorkbook,
    currentWorkbookRef,
    workbookRevision,
    replaceCurrentWorkbook,
    updateCharts,
    updateSheetRevision,
    updateWorkbookMetadata,
    loadWorkbook,
    reloadCurrentWorkbook,
    loadSheet,
  } = useWorkbookDocument(workspaceId, initial?.currentWorkbook);
  const [referenceCacheRevision, setReferenceCacheRevision] = useState(0);

  useEffect(() => {
    const targetWorkbookId = transition?.targetWorkbookId;
    if (
      workspaceId == null ||
      transition?.status !== "loading" ||
      targetWorkbookId == null ||
      currentWorkbook?.id === targetWorkbookId
    ) {
      return;
    }

    let cancelled = false;
    void loadWorkbook(targetWorkbookId, { loadChartDependencies: true })
      .then((loaded) => {
        if (!cancelled && loaded) commitWorkbook(targetWorkbookId);
      })
      .catch((error: unknown) => {
        if (!cancelled) failWorkbookTransition(error);
      });

    return () => {
      cancelled = true;
    };
  }, [
    commitWorkbook,
    currentWorkbook?.id,
    failWorkbookTransition,
    loadWorkbook,
    transition,
    workspaceId,
  ]);

  const sheets = useSheetNavigation(workspaceId, currentWorkbook, loadSheet);

  const invalidateReferenceCache = useCallback(() => {
    setReferenceCacheRevision((revision) => revision + 1);
  }, []);

  const handleSheetRevisionChanged = useCallback(
    (sheetId: number, revision: number) => {
      updateSheetRevision(sheetId, revision);
    },
    [updateSheetRevision],
  );

  const refreshCurrentWorkbook = useCallback(async () => {
    if (!currentWorkbook || workspaceId == null) return;
    await reloadCurrentWorkbook({
      sheetIds: loadedSheetIds(currentWorkbook),
    });
  }, [currentWorkbook, reloadCurrentWorkbook, workspaceId]);

  const refreshCurrentCharts = useCallback(async () => {
    const workbook = currentWorkbookRef.current;
    if (!workbook || workspaceId == null) return;
    try {
      const charts = await listCharts(workspaceId, workbook.id);
      if (currentWorkbookRef.current?.id !== workbook.id) return;
      updateCharts(charts);
    } catch (error) {
      console.error("[workbook] Failed to refresh charts:", error);
    }
  }, [currentWorkbookRef, updateCharts, workspaceId]);

  const handleChartMutation = useCallback(
    (mutation: ChartMutation) => {
      const workbook = currentWorkbookRef.current;
      if (!workbook) return;
      const charts = [...workbook.charts];
      if (mutation.kind === "created") {
        if (charts.some((chart) => chart.id === mutation.chart.id)) return;
        charts.push(mutation.chart);
      } else if (mutation.kind === "updated") {
        const index = charts.findIndex((chart) => chart.id === mutation.chart.id);
        if (index < 0) return;
        charts[index] = mutation.chart;
      } else {
        const nextCharts = charts.filter((chart) => chart.id !== mutation.chartId);
        if (nextCharts.length === charts.length) return;
        updateCharts(nextCharts);
        return;
      }
      updateCharts(charts);
    },
    [currentWorkbookRef, updateCharts],
  );

  const handleSheetChanged = useCallback(
    async (sheetId: number, delta: SheetChangeDelta | null, version?: SheetChangeVersion) => {
      const workbook = currentWorkbookRef.current;
      if (!workbook || workspaceId == null) return;
      if (!workbook.sheets.some((sheet) => sheet.id === sheetId)) return;

      if (delta) {
        const patched = patchWorkbookWithDelta(workbook, sheetId, delta, version);
        if (patched) {
          replaceCurrentWorkbook(patched);
          return;
        }
      }

      await reloadCurrentWorkbook({ sheetIds: loadedSheetIds(workbook) });
    },
    [currentWorkbookRef, reloadCurrentWorkbook, replaceCurrentWorkbook, workspaceId],
  );

  const handleWorkspaceRefresh = useCallback(async () => {
    if (workspaceId == null) return;
    const safeList = await refreshCatalog();
    if (!safeList) return;
    invalidateReferenceCache();

    const currentId = currentWorkbookRef.current?.id;
    if (currentId != null && safeList.some((workbook) => workbook.id === currentId)) {
      await reloadCurrentWorkbook({
        sheetIds: loadedSheetIds(currentWorkbookRef.current),
      });
      return;
    }

    const nextId = safeList[workbookIdx]?.id ?? safeList[0]?.id;
    if (nextId != null) {
      requestWorkbookById(nextId);
      sheets.setCurrentSheetIndex(0);
    } else {
      replaceCurrentWorkbook(null);
      clearActiveWorkbook();
      sheets.setCurrentSheetIndex(0);
    }
  }, [
    clearActiveWorkbook,
    currentWorkbookRef,
    invalidateReferenceCache,
    refreshCatalog,
    reloadCurrentWorkbook,
    replaceCurrentWorkbook,
    requestWorkbookById,
    sheets,
    workbookIdx,
    workspaceId,
  ]);

  const handleWorkbookStructureChanged = useCallback(
    async (update: WorkbookStructureUpdate) => {
      if (workspaceId == null) return;
      invalidateReferenceCache();

      if (update.kind === "workbook-created") {
        const safeList = await refreshCatalog();
        if (safeList?.some((workbook) => workbook.id === update.workbookId)) {
          requestWorkbookById(update.workbookId);
          sheets.setCurrentSheetIndex(0);
        }
        return;
      }

      const workbook = currentWorkbookRef.current;
      if (!workbook || workbook.id !== update.workbookId) return;
      const nextWorkbook = await reloadCurrentWorkbook({
        sheetIds: loadedSheetIds(workbook),
      });
      if (!nextWorkbook || nextWorkbook.sheets.length === 0) {
        sheets.setCurrentSheetIndex(0);
        return;
      }

      if (update.kind === "sheet-deleted") {
        const nextIndex = nextWorkbook.sheets.findIndex((sheet) => sheet.id === update.sheetId);
        sheets.setCurrentSheetIndex(
          nextIndex >= 0
            ? nextIndex
            : getSheetIndexAfterDeletion(update.order, nextWorkbook.sheets.length),
        );
        return;
      }

      const nextIndex = nextWorkbook.sheets.findIndex((sheet) => sheet.id === update.sheetId);
      sheets.setCurrentSheetIndex(
        nextIndex >= 0 ? nextIndex : normalizeSheetIndex(update.order, nextWorkbook.sheets.length),
      );
    },
    [
      currentWorkbookRef,
      invalidateReferenceCache,
      refreshCatalog,
      reloadCurrentWorkbook,
      requestWorkbookById,
      sheets,
      workspaceId,
    ],
  );

  const handleSwitchWorkbook = useCallback(
    (index: number) => {
      switchWorkbook(index);
    },
    [switchWorkbook],
  );

  const handleNewWorkbookFileChange = useCallback(
    async (files: File[]): Promise<boolean> => {
      if (workspaceId == null || files.length === 0) return false;
      if (files.length > MAX_IMPORT_WORKBOOKS) {
        toast({ message: `一次最多选择 ${MAX_IMPORT_WORKBOOKS} 个文件`, variant: "error" });
        return false;
      }
      try {
        const imported = await importWorkbooksInCatalog(files);
        if (!imported) return false;
        invalidateReferenceCache();
        const lastResult = imported.results[imported.results.length - 1];
        if (lastResult) {
          requestWorkbookById(lastResult.id);
          sheets.setCurrentSheetIndex(0);
        }
        if (imported.error) {
          const progress =
            imported.completedFiles > 0
              ? `已完成 ${imported.completedFiles}/${files.length} 个文件。`
              : "";
          const file = imported.activeFileName ? `（文件：${imported.activeFileName}）` : "";
          const message = imported.error instanceof Error ? imported.error.message : "上传失败";
          toast({ message: `${progress}上传失败${file}：${message}`, variant: "error" });
          return imported.completedFiles > 0;
        }
        toast({
          message: files.length === 1 ? "上传完成" : `已上传 ${files.length} 个文件`,
          variant: "success",
        });
        return imported.results.length > 0;
      } catch (error) {
        toast({ message: error instanceof Error ? error.message : "上传失败", variant: "error" });
        return false;
      }
    },
    [importWorkbooksInCatalog, invalidateReferenceCache, requestWorkbookById, sheets, workspaceId],
  );

  const handleWorkbookDelete = useCallback(
    async (workbookId: number) => {
      if (workspaceId == null) return;
      try {
        const mutation = await deleteWorkbookInCatalog(workbookId);
        if (!mutation) return;
        invalidateReferenceCache();
        if (workbookId === activeWorkbookId) {
          const next = mutation.workbooks[0];
          if (next) {
            requestWorkbookById(next.id);
            sheets.setCurrentSheetIndex(0);
          } else {
            replaceCurrentWorkbook(null);
            clearActiveWorkbook();
          }
        }
        toast({ message: "工作簿已删除", variant: "success" });
      } catch (error) {
        toast({
          message: error instanceof Error ? error.message : "删除工作簿失败",
          variant: "error",
        });
        throw error;
      }
    },
    [
      activeWorkbookId,
      clearActiveWorkbook,
      deleteWorkbookInCatalog,
      invalidateReferenceCache,
      replaceCurrentWorkbook,
      requestWorkbookById,
      sheets,
      workspaceId,
    ],
  );

  const handleCreateWorkbook = useCallback(
    async (_requestedWorkspaceId: number) => {
      if (workspaceId == null) return;
      try {
        const mutation = await createWorkbookInCatalog();
        if (!mutation) return;
        invalidateReferenceCache();
        requestWorkbookById(mutation.result.id);
        sheets.setCurrentSheetIndex(0);
        toast({ message: "工作簿已创建", variant: "success" });
      } catch (error) {
        toast({ message: error instanceof Error ? error.message : "创建失败", variant: "error" });
      }
    },
    [createWorkbookInCatalog, invalidateReferenceCache, requestWorkbookById, sheets, workspaceId],
  );

  const handleWorkbookRename = useCallback(
    async (workbookId: number, newName: string) => {
      if (workspaceId == null) return;
      try {
        const mutation = await renameWorkbookInCatalog(workbookId, newName);
        if (!mutation) return;
        if (currentWorkbookRef.current?.id === workbookId) {
          updateWorkbookMetadata((workbook) => ({ ...workbook, name: newName }));
        }
        invalidateReferenceCache();
        toast({ message: "工作簿已重命名", variant: "success" });
      } catch (error) {
        toast({ message: error instanceof Error ? error.message : "重命名失败", variant: "error" });
      }
    },
    [
      currentWorkbookRef,
      invalidateReferenceCache,
      renameWorkbookInCatalog,
      updateWorkbookMetadata,
      workspaceId,
    ],
  );

  return {
    workbooks,
    workbookIdx,
    currentWorkbook,
    workbookRevision,
    loading,
    transition,
    retryWorkbookTransition: retryTransition,
    currentSheetIndex: sheets.currentSheetIndex,
    setCurrentSheetIndex: sheets.setCurrentSheetIndex,
    sheetLoading: sheets.sheetLoading,
    sheetLoadError: sheets.sheetLoadError,
    retryCurrentSheet: sheets.retryCurrentSheet,
    loadSheetById: sheets.loadSheetById,
    handleSheetChanged,
    handleSheetRevisionChanged,
    handleWorkbookStructureChanged,
    handleWorkbookRefresh: refreshCurrentWorkbook,
    handleChartsRefresh: refreshCurrentCharts,
    handleChartMutation,
    handleWorkspaceRefresh,
    handleSwitchWorkbook,
    handleNewWorkbookFileChange,
    handleWorkbookDelete,
    handleWorkbookRename,
    handleCreateWorkbook,
    referenceCacheRevision,
  };
}
