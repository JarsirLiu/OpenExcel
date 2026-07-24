import type { SheetChangeDelta, SheetChangeVersion } from "@openexcel/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkbookMeta } from "@/api/workbooks";
import {
  createWorkbook,
  deleteWorkbook,
  fetchWorkbook,
  fetchWorkbooks,
  importWorkbooks,
  updateWorkbookName,
} from "@/api/workbooks";
import type { WorkbookStructureUpdate } from "@/features/sync/types";
import { isWorkbookSnapshotStale } from "@/features/sync/workbookRevision";
import { toast } from "@/shared/lib";
import { patchWorkbookWithDelta } from "../workbook/utils/patchWorkbook";
import { getSheetIndexAfterDeletion, normalizeSheetIndex } from "./sheetIndex";
import { useWorkbookCatalog, type WorkbookInitial } from "./useWorkbookCatalog";
import { sortWorkbooks } from "./workbookOrdering";

const SHEET_STORAGE_KEY = "openexcel:sheetIdx";
const MAX_IMPORT_WORKBOOKS = 20;

function loadStoredSheetIdx(): number {
  try {
    const stored = sessionStorage.getItem(SHEET_STORAGE_KEY);
    const parsed = stored === null ? 0 : Number(stored);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
  } catch {
    return 0;
  }
}

export function useWorkspaceView(workspaceId: number | null, initial?: WorkbookInitial) {
  const {
    workbooks,
    workbookIdx,
    switchWorkbook,
    currentWorkbook,
    loading,
    setWorkbooks,
    replaceCurrentWorkbook,
    setWorkbookIdx,
    workbookRevision,
  } = useWorkbookCatalog(workspaceId, initial);

  const [currentSheetIndex, setCurrentSheetIndex] = useState(loadStoredSheetIdx);
  const [referenceCacheRevision, setReferenceCacheRevision] = useState(0);
  const currentWorkbookRef = useRef(currentWorkbook);
  const currentSheetIndexRef = useRef(currentSheetIndex);
  const requestGenerationRef = useRef(0);
  const refreshControllerRef = useRef<AbortController | null>(null);

  const beginRequest = useCallback(() => {
    requestGenerationRef.current += 1;
    refreshControllerRef.current?.abort();
    const controller = new AbortController();
    refreshControllerRef.current = controller;
    return { generation: requestGenerationRef.current, controller };
  }, []);

  const isCurrentRequest = useCallback((generation: number, signal: AbortSignal) => {
    return generation === requestGenerationRef.current && !signal.aborted;
  }, []);

  useEffect(() => {
    requestGenerationRef.current += 1;
    refreshControllerRef.current?.abort();
    refreshControllerRef.current = null;
    currentWorkbookRef.current = null;
    return () => {
      requestGenerationRef.current += 1;
      refreshControllerRef.current?.abort();
    };
  }, [workspaceId]);

  useEffect(() => {
    currentWorkbookRef.current = currentWorkbook;
  }, [currentWorkbook]);

  const invalidateReferenceCache = useCallback(() => {
    setReferenceCacheRevision((revision) => revision + 1);
  }, []);

  const handleSheetRevisionChanged = useCallback((sheetId: number, revision: number) => {
    const workbook = currentWorkbookRef.current;
    const sheet = workbook?.sheets.find((item) => item.id === sheetId);
    if (sheet && revision > sheet.revision) sheet.revision = revision;
  }, []);

  const replaceWorkbookIfFresh = useCallback(
    (nextWorkbook: NonNullable<typeof currentWorkbook>) => {
      const current = currentWorkbookRef.current;
      if (current && isWorkbookSnapshotStale(current, nextWorkbook)) {
        const merged = { ...current, charts: nextWorkbook.charts };
        currentWorkbookRef.current = merged;
        replaceCurrentWorkbook(merged);
        return false;
      }
      currentWorkbookRef.current = nextWorkbook;
      replaceCurrentWorkbook(nextWorkbook);
      return true;
    },
    [replaceCurrentWorkbook],
  );

  useEffect(() => {
    try {
      sessionStorage.setItem(SHEET_STORAGE_KEY, String(currentSheetIndex));
    } catch {
      // ignore
    }
  }, [currentSheetIndex]);

  useEffect(() => {
    currentSheetIndexRef.current = currentSheetIndex;
  }, [currentSheetIndex]);

  useEffect(() => {
    if (!currentWorkbook) return;
    const nextIndex = normalizeSheetIndex(currentSheetIndex, currentWorkbook.sheets.length);
    if (nextIndex !== currentSheetIndex) setCurrentSheetIndex(nextIndex);
  }, [currentSheetIndex, currentWorkbook]);

  const chartSheetSignature =
    currentWorkbook?.charts.map((chart) => `${chart.id}:${chart.sheetId}`).join("|") ?? "";

  useEffect(() => {
    const workbook = currentWorkbookRef.current;
    if (!workbook || workbook.charts.length === 0) return;
    const activeSheet = workbook.sheets[currentSheetIndexRef.current];
    if (activeSheet && workbook.charts.some((chart) => chart.sheetId === String(activeSheet.id))) {
      return;
    }

    const chartSheetIndex = workbook.sheets.findIndex((sheet) =>
      workbook.charts.some((chart) => chart.sheetId === String(sheet.id)),
    );
    if (chartSheetIndex >= 0 && chartSheetIndex !== currentSheetIndexRef.current) {
      setCurrentSheetIndex(chartSheetIndex);
    }
  }, [chartSheetSignature, currentWorkbook?.id]);

  const refreshCurrentWorkbook = useCallback(async () => {
    if (!currentWorkbook || workspaceId == null) return;
    const { generation, controller } = beginRequest();
    try {
      const full = await fetchWorkbook(workspaceId, currentWorkbook.id, {
        signal: controller.signal,
      });
      if (!isCurrentRequest(generation, controller.signal)) return;
      replaceWorkbookIfFresh(full);
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error("[workbook] Failed to refresh current workbook:", error);
      }
    }
  }, [beginRequest, currentWorkbook, isCurrentRequest, replaceWorkbookIfFresh, workspaceId]);

  const refreshWorkspace = useCallback(async () => {
    if (workspaceId == null) return;
    const { generation, controller } = beginRequest();

    try {
      let list: WorkbookMeta[];
      try {
        list = await fetchWorkbooks(workspaceId, { signal: controller.signal });
      } catch (error) {
        if (controller.signal.aborted) return;
        throw error;
      }
      if (!isCurrentRequest(generation, controller.signal)) return;
      const safeList = Array.isArray(list) ? sortWorkbooks(list) : [];
      setWorkbooks(safeList);
      invalidateReferenceCache();

      const nextWorkbookId =
        currentWorkbook && safeList.some((workbook) => workbook.id === currentWorkbook.id)
          ? currentWorkbook.id
          : (safeList[workbookIdx]?.id ?? safeList[0]?.id ?? null);

      if (nextWorkbookId == null) {
        replaceCurrentWorkbook(null);
        setWorkbookIdx(0);
        setCurrentSheetIndex(0);
        return;
      }

      const nextWorkbook = await fetchWorkbook(workspaceId, nextWorkbookId, {
        signal: controller.signal,
      });
      if (!isCurrentRequest(generation, controller.signal)) return;
      replaceWorkbookIfFresh(nextWorkbook);
      const nextIndex = safeList.findIndex((workbook) => workbook.id === nextWorkbookId);
      setWorkbookIdx(nextIndex >= 0 ? nextIndex : 0);

      const nextSheetIndex =
        currentWorkbook?.id === nextWorkbookId
          ? Math.min(currentSheetIndex, Math.max(0, nextWorkbook.sheets.length - 1))
          : 0;
      setCurrentSheetIndex(nextSheetIndex);
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error("[workbook] Failed to refresh workspace:", error);
      }
    }
  }, [
    beginRequest,
    currentSheetIndex,
    currentWorkbook,
    invalidateReferenceCache,
    isCurrentRequest,
    replaceWorkbookIfFresh,
    setCurrentSheetIndex,
    setWorkbookIdx,
    setWorkbooks,
    workbookIdx,
    workspaceId,
  ]);

  const handleSheetChanged = useCallback(
    async (sheetId: number, delta: SheetChangeDelta | null, version?: SheetChangeVersion) => {
      const workbook = currentWorkbookRef.current;
      if (!workbook || workspaceId == null) return;
      const hasSheet = workbook.sheets.some((sheet) => sheet.id === sheetId);
      if (!hasSheet) return;

      if (delta) {
        const patched = patchWorkbookWithDelta(workbook, sheetId, delta, version);
        if (patched) {
          currentWorkbookRef.current = patched;
          replaceCurrentWorkbook(patched);
          return;
        }
      }

      try {
        const { generation, controller } = beginRequest();
        const full = await fetchWorkbook(workspaceId, workbook.id, {
          signal: controller.signal,
        });
        if (!isCurrentRequest(generation, controller.signal)) return;
        replaceWorkbookIfFresh(full);
      } catch (error) {
        console.error("[workbook] Failed to refresh after sheet change:", error);
      }
    },
    [beginRequest, isCurrentRequest, replaceWorkbookIfFresh, workspaceId],
  );

  const handleWorkbookStructureChanged = useCallback(
    async (update: WorkbookStructureUpdate) => {
      if (workspaceId == null) return;
      const { generation, controller } = beginRequest();
      invalidateReferenceCache();

      try {
        if (update.kind === "workbook-created") {
          const list = await fetchWorkbooks(workspaceId, { signal: controller.signal });
          if (!isCurrentRequest(generation, controller.signal)) return;
          const safeList = Array.isArray(list) ? sortWorkbooks(list) : [];
          setWorkbooks(safeList);
          const nextIndex = safeList.findIndex((wb) => wb.id === update.workbookId);
          setWorkbookIdx(nextIndex >= 0 ? nextIndex : 0);
          setCurrentSheetIndex(0);
          return;
        }

        if (update.kind === "sheet-deleted") {
          if (currentWorkbook?.id !== update.workbookId) {
            return;
          }

          const nextWorkbook = await fetchWorkbook(workspaceId, update.workbookId, {
            signal: controller.signal,
          });
          if (!isCurrentRequest(generation, controller.signal)) return;
          replaceWorkbookIfFresh(nextWorkbook);

          if (nextWorkbook.sheets.length === 0) {
            setCurrentSheetIndex(0);
            return;
          }

          const nextIndex = nextWorkbook.sheets.findIndex((sheet) => sheet.id === update.sheetId);
          const fallbackIndex = getSheetIndexAfterDeletion(
            update.order,
            nextWorkbook.sheets.length,
          );
          setCurrentSheetIndex(nextIndex >= 0 ? nextIndex : fallbackIndex);
          return;
        }

        if (currentWorkbook?.id !== update.workbookId) {
          return;
        }

        const nextWorkbook = await fetchWorkbook(workspaceId, update.workbookId, {
          signal: controller.signal,
        });
        if (!isCurrentRequest(generation, controller.signal)) return;
        replaceWorkbookIfFresh(nextWorkbook);
        const nextIndex = nextWorkbook.sheets.findIndex((sheet) => sheet.id === update.sheetId);
        setCurrentSheetIndex(
          nextIndex >= 0
            ? nextIndex
            : normalizeSheetIndex(update.order, nextWorkbook.sheets.length),
        );
      } catch (error) {
        if (!controller.signal.aborted) throw error;
      }
    },
    [
      currentWorkbook?.id,
      beginRequest,
      invalidateReferenceCache,
      isCurrentRequest,
      replaceWorkbookIfFresh,
      setCurrentSheetIndex,
      setWorkbookIdx,
      setWorkbooks,
      workspaceId,
    ],
  );

  const handleSwitchWorkbook = useCallback(
    async (index: number) => {
      await switchWorkbook(index);
      setCurrentSheetIndex(0);
    },
    [switchWorkbook],
  );

  const handleNewWorkbookFileChange = useCallback(
    async (files: File[]): Promise<boolean> => {
      if (workspaceId == null) return false;
      if (files.length === 0) return false;
      if (files.length > MAX_IMPORT_WORKBOOKS) {
        toast({ message: `一次最多选择 ${MAX_IMPORT_WORKBOOKS} 个文件`, variant: "error" });
        return false;
      }
      const { generation, controller } = beginRequest();
      let completedFiles = 0;
      let activeFileName = "";
      try {
        const results: { id: number; publicId: string; name: string; sheets: number }[] = [];
        for (let index = 0; index < files.length; index += 1) {
          const file = files[index];
          if (!file) continue;
          activeFileName = file.name;
          const uploaded = await importWorkbooks(workspaceId, file, {
            signal: controller.signal,
          });
          results.push(...uploaded);
          completedFiles += 1;
        }

        const list = await fetchWorkbooks(workspaceId, { signal: controller.signal });
        if (!isCurrentRequest(generation, controller.signal)) return results.length > 0;
        const safeList = Array.isArray(list) ? sortWorkbooks(list) : [];
        setWorkbooks(safeList);
        invalidateReferenceCache();
        const lastResult = results[results.length - 1];
        const idx = lastResult ? safeList.findIndex((wb) => wb.id === lastResult.id) : -1;
        if (idx >= 0) {
          setWorkbookIdx(idx);
          setCurrentSheetIndex(0);
        }
        toast({
          message: files.length === 1 ? "上传完成" : `已上传 ${files.length} 个文件`,
          variant: "success",
        });
        return results.length > 0;
      } catch (error) {
        if (controller.signal.aborted) return completedFiles > 0;
        const message = error instanceof Error ? error.message : "上传失败";

        if (completedFiles > 0) {
          try {
            const list = await fetchWorkbooks(workspaceId, { signal: controller.signal });
            if (isCurrentRequest(generation, controller.signal)) {
              setWorkbooks(Array.isArray(list) ? sortWorkbooks(list) : []);
            }
          } catch {
            // Keep the original import error as the user-facing message.
          }
        }

        const progress =
          completedFiles > 0 ? `已完成 ${completedFiles}/${files.length} 个文件。` : "";
        const file = activeFileName ? `（文件：${activeFileName}）` : "";
        toast({ message: `${progress}上传失败${file}：${message}`, variant: "error" });
        return completedFiles > 0;
      }
    },
    [
      beginRequest,
      invalidateReferenceCache,
      isCurrentRequest,
      setWorkbooks,
      setWorkbookIdx,
      workspaceId,
    ],
  );

  const handleWorkbookDelete = useCallback(
    async (workbookId: number) => {
      if (workspaceId == null) return;
      const { generation, controller } = beginRequest();
      try {
        await deleteWorkbook(workspaceId, workbookId);
      } catch (error) {
        if (controller.signal.aborted) return;
        toast({
          message: error instanceof Error ? error.message : "删除工作簿失败",
          variant: "error",
        });
        throw error;
      }
      let list: WorkbookMeta[];
      try {
        list = await fetchWorkbooks(workspaceId, { signal: controller.signal });
      } catch (error) {
        if (controller.signal.aborted) return;
        toast({
          message: error instanceof Error ? error.message : "刷新工作簿列表失败",
          variant: "error",
        });
        throw error;
      }
      if (!isCurrentRequest(generation, controller.signal)) return;
      const safeList = Array.isArray(list) ? sortWorkbooks(list) : [];
      setWorkbooks(safeList);
      invalidateReferenceCache();
      const remaining = safeList.filter((wb) => wb.id !== workbookId);
      if (remaining.length > 0) {
        setWorkbookIdx(0);
        setCurrentSheetIndex(0);
      } else {
        setWorkbookIdx(0);
        replaceCurrentWorkbook(null);
      }
      toast({ message: "工作簿已删除", variant: "success" });
    },
    [
      beginRequest,
      invalidateReferenceCache,
      isCurrentRequest,
      replaceCurrentWorkbook,
      setWorkbookIdx,
      setWorkbooks,
      workspaceId,
    ],
  );

  const handleCreateWorkbook = useCallback(
    async (workspaceId: number) => {
      if (workspaceId == null) return;
      const { generation, controller } = beginRequest();
      try {
        const result = await createWorkbook(workspaceId);
        const list = await fetchWorkbooks(workspaceId, { signal: controller.signal });
        if (!isCurrentRequest(generation, controller.signal)) return;
        const safeList = Array.isArray(list) ? sortWorkbooks(list) : [];
        setWorkbooks(safeList);
        invalidateReferenceCache();
        const idx = safeList.findIndex((wb) => wb.id === result.id);
        if (idx >= 0) {
          setWorkbookIdx(idx);
          setCurrentSheetIndex(0);
        }
        toast({ message: "工作簿已创建", variant: "success" });
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "创建失败";
        toast({ message, variant: "error" });
      }
    },
    [
      beginRequest,
      invalidateReferenceCache,
      isCurrentRequest,
      setWorkbookIdx,
      setWorkbooks,
      workspaceId,
    ],
  );

  const handleWorkbookRename = useCallback(
    async (workbookId: number, newName: string) => {
      if (workspaceId == null) return;
      const { generation, controller } = beginRequest();
      try {
        await updateWorkbookName(workspaceId, workbookId, newName);
        const list = await fetchWorkbooks(workspaceId, { signal: controller.signal });
        if (!isCurrentRequest(generation, controller.signal)) return;
        const safeList = Array.isArray(list) ? sortWorkbooks(list) : [];
        setWorkbooks(safeList);
        if (currentWorkbook?.id === workbookId) {
          replaceCurrentWorkbook({ ...currentWorkbook, name: newName });
        }
        invalidateReferenceCache();
        toast({ message: "工作簿已重命名", variant: "success" });
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "重命名失败";
        toast({ message, variant: "error" });
      }
    },
    [
      currentWorkbook,
      beginRequest,
      invalidateReferenceCache,
      isCurrentRequest,
      replaceCurrentWorkbook,
      setWorkbooks,
      workspaceId,
    ],
  );

  return {
    workbooks,
    workbookIdx,
    currentWorkbook,
    workbookRevision,
    loading,
    currentSheetIndex,
    setCurrentSheetIndex,
    handleSheetChanged,
    handleSheetRevisionChanged,
    handleWorkbookStructureChanged,
    handleWorkbookRefresh: refreshCurrentWorkbook,
    handleWorkspaceRefresh: refreshWorkspace,
    handleSwitchWorkbook,
    handleNewWorkbookFileChange,
    handleWorkbookDelete,
    handleWorkbookRename,
    handleCreateWorkbook,
    referenceCacheRevision,
  };
}
