import type { SheetChangeDelta, SheetChangeVersion } from "@openexcel/core";
import { useCallback, useEffect, useState } from "react";
import { listCharts } from "@/api/charts";
import type { WorkbookFull } from "@/api/workbooks";
import type { WorkbookStructureUpdate } from "@/features/sync/types";
import type { ChartMutation } from "@/features/workbook/charts/chartMutation";
import { t } from "@/lib/i18n";
import { toast } from "@/shared/lib";
import { patchWorkbookWithDelta } from "../workbook/utils/patchWorkbook";
import { importWarningMessage } from "./importWarnings";
import { getSheetIndexAfterDeletion, normalizeSheetIndex } from "./sheetIndex";
import { useSheetNavigation } from "./useSheetNavigation";
import { useWorkbookCatalog, type WorkbookInitial } from "./useWorkbookCatalog";
import { useWorkbookDocument } from "./useWorkbookDocument";

const MAX_IMPORT_WORKBOOKS = 20;

function loadedSheetIds(workbook: WorkbookFull | null): number[] | undefined {
  if (!workbook) return undefined;
  const ids = workbook.sheets.filter((sheet) => sheet.loaded !== false).map((sheet) => sheet.id);
  return ids.length > 0 ? ids : undefined;
}

export function useWorkspaceView(workspaceId: number | null, initial?: WorkbookInitial) {
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
  } = useWorkbookCatalog(workspaceId, initial);
  const {
    currentWorkbook,
    currentWorkbookRef,
    workbookRevision,
    replaceCurrentWorkbook,
    updateCharts,
    updateSheetRevision,
    updateSheetContent,
    updateWorkbookMetadata,
    loadWorkbook,
    reloadCurrentWorkbook,
    loadSheet,
    documentStore,
  } = useWorkbookDocument(workspaceId, initial?.currentWorkbook);
  const [referenceCacheRevision, setReferenceCacheRevision] = useState(0);

  useEffect(() => {
    const targetWorkbookId = transition?.targetWorkbookId;
    if (workspaceId == null || transition?.status !== "loading" || targetWorkbookId == null) {
      return;
    }

    // The document store is updated before the async loader resolves. Treat
    // that observable document identity as the successful transition signal.
    if (currentWorkbook?.id === targetWorkbookId) {
      commitWorkbook(targetWorkbookId);
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
  const {
    currentSheetIndex,
    setCurrentSheetIndex,
    sheetLoading,
    sheetLoadError,
    retryCurrentSheet,
    loadSheetById,
  } = sheets;

  const invalidateReferenceCache = useCallback(() => {
    setReferenceCacheRevision((revision) => revision + 1);
  }, []);

  const handleSheetRevisionChanged = useCallback(
    (sheetId: number, revision: number, persistedThroughVersion?: number) => {
      updateSheetRevision(sheetId, revision, persistedThroughVersion);
    },
    [updateSheetRevision],
  );

  const refreshCurrentWorkbook = useCallback(async () => {
    if (!currentWorkbook || workspaceId == null) return;
    await reloadCurrentWorkbook({
      sheetIds: loadedSheetIds(currentWorkbook),
    });
  }, [currentWorkbook, reloadCurrentWorkbook, workspaceId]);

  const ensureAllSheetsLoaded = useCallback(async () => {
    const current = currentWorkbookRef.current;
    if (workspaceId == null || current == null) return current;
    if (current.sheets.every((sheet) => sheet.loaded !== false)) return current;
    return reloadCurrentWorkbook({
      sheetIds: current.sheets.map((sheet) => sheet.id),
      preserveEditorSession: true,
    });
  }, [currentWorkbookRef, reloadCurrentWorkbook, workspaceId]);

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
      setCurrentSheetIndex(0);
    } else {
      replaceCurrentWorkbook(null);
      clearActiveWorkbook();
      setCurrentSheetIndex(0);
    }
  }, [
    clearActiveWorkbook,
    currentWorkbookRef,
    invalidateReferenceCache,
    refreshCatalog,
    reloadCurrentWorkbook,
    replaceCurrentWorkbook,
    requestWorkbookById,
    setCurrentSheetIndex,
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
          setCurrentSheetIndex(0);
        }
        return;
      }

      const workbook = currentWorkbookRef.current;
      if (!workbook || workbook.id !== update.workbookId) return;
      const nextWorkbook = await reloadCurrentWorkbook({
        sheetIds: loadedSheetIds(workbook),
      });
      if (!nextWorkbook || nextWorkbook.sheets.length === 0) {
        setCurrentSheetIndex(0);
        return;
      }

      if (update.kind === "sheet-deleted") {
        const nextIndex = nextWorkbook.sheets.findIndex((sheet) => sheet.id === update.sheetId);
        setCurrentSheetIndex(
          nextIndex >= 0
            ? nextIndex
            : getSheetIndexAfterDeletion(update.order, nextWorkbook.sheets.length),
        );
        return;
      }

      const nextIndex = nextWorkbook.sheets.findIndex((sheet) => sheet.id === update.sheetId);
      setCurrentSheetIndex(
        nextIndex >= 0 ? nextIndex : normalizeSheetIndex(update.order, nextWorkbook.sheets.length),
      );
    },
    [
      currentWorkbookRef,
      invalidateReferenceCache,
      refreshCatalog,
      reloadCurrentWorkbook,
      requestWorkbookById,
      setCurrentSheetIndex,
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
        toast({
          message: t("max_workbook_import_count", { count: MAX_IMPORT_WORKBOOKS }),
          variant: "error",
        });
        return false;
      }
      try {
        const imported = await importWorkbooksInCatalog(files);
        if (!imported) return false;
        invalidateReferenceCache();
        const lastResult = imported.results[imported.results.length - 1];
        if (lastResult) {
          requestWorkbookById(lastResult.id);
          setCurrentSheetIndex(0);
        }
        if (imported.error) {
          const progress =
            imported.completedFiles > 0
              ? t("workbook_upload_progress", {
                  completed: imported.completedFiles,
                  total: files.length,
                })
              : "";
          const file = imported.activeFileName
            ? t("workbook_upload_file", { name: imported.activeFileName })
            : "";
          const message =
            imported.error instanceof Error ? imported.error.message : t("workbook_upload_failed");
          const warning = importWarningMessage(imported.results);
          toast({
            message: t("workbook_upload_error", {
              progress,
              message: t("workbook_upload_failed"),
              file,
              error: warning ? `${message}\n${warning}` : message,
            }),
            variant: "error",
          });
          return imported.completedFiles > 0;
        }
        const warning = importWarningMessage(imported.results);
        toast({
          message: [
            files.length === 1
              ? t("workbook_upload_completed")
              : t("uploaded_workbook_count", { count: files.length }),
            warning,
          ]
            .filter(Boolean)
            .join("\n"),
          variant: warning ? "warning" : "success",
        });
        return imported.results.length > 0;
      } catch (error) {
        toast({
          message: error instanceof Error ? error.message : t("workbook_upload_failed"),
          variant: "error",
        });
        return false;
      }
    },
    [
      importWorkbooksInCatalog,
      invalidateReferenceCache,
      requestWorkbookById,
      setCurrentSheetIndex,
      workspaceId,
    ],
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
            setCurrentSheetIndex(0);
          } else {
            replaceCurrentWorkbook(null);
            clearActiveWorkbook();
          }
        }
        toast({ message: t("workbook_deleted"), variant: "success" });
      } catch (error) {
        toast({
          message: error instanceof Error ? error.message : t("delete_workbook_failed"),
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
      setCurrentSheetIndex,
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
        setCurrentSheetIndex(0);
        toast({ message: t("workbook_created"), variant: "success" });
      } catch (error) {
        toast({
          message: error instanceof Error ? error.message : t("create_workbook_failed"),
          variant: "error",
        });
      }
    },
    [
      createWorkbookInCatalog,
      invalidateReferenceCache,
      requestWorkbookById,
      setCurrentSheetIndex,
      workspaceId,
    ],
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
        toast({ message: t("workbook_renamed"), variant: "success" });
      } catch (error) {
        toast({
          message: error instanceof Error ? error.message : t("rename_workbook_failed"),
          variant: "error",
        });
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
    documentStore,
    workbookRevision,
    loading,
    transition,
    retryWorkbookTransition: retryTransition,
    currentSheetIndex,
    setCurrentSheetIndex,
    sheetLoading,
    sheetLoadError,
    retryCurrentSheet,
    loadSheetById,
    handleSheetChanged,
    handleSheetRevisionChanged,
    handleSheetContentChanged: updateSheetContent,
    handleWorkbookStructureChanged,
    handleWorkbookRefresh: refreshCurrentWorkbook,
    ensureAllSheetsLoaded,
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
