import type { WorkbookInstance } from "@fortune-sheet/react";
import {
  type CellRange,
  collectDocumentStyles,
  type DocumentOperation,
  extractSheetConfig,
  type FortuneCell,
  matrixToCelldata,
} from "@openexcel/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyDocumentLayout,
  applyDocumentOperations,
  DocumentRevisionConflictError,
  fetchDocumentRange,
} from "@/api/documents";
import type { WorkbookFull } from "@/api/workbooks";
import {
  createSheet,
  deleteSheet,
  deleteWorkbook,
  downloadWorkbook,
  updateSheetName,
} from "@/api/workbooks";
import type {
  SheetPatchUpdate,
  WorkbookStructureUpdate,
} from "@/features/chat/hooks/useSheetPatchSync";
import { confirm } from "@/shared/lib";
import { buildDocumentOperations, valueKey } from "./documentSync";
import {
  buildFortuneSheetViewportUpdates,
  type FortuneSheetRuntime,
  toFortuneSheetData,
} from "./fortuneSheet";
import { useSheetActivation } from "./SheetActivationContext";
import { rendererRowToDocumentRow } from "./sheetCoordinates";
import { useWorkbookEditorSession } from "./useWorkbookEditorSession";
import {
  createViewportCache,
  expandRangeToChunks,
  invalidateDocumentRanges,
  mergeDocumentRange,
  missingChunksForRange,
  rangeToA1,
  syncViewportCacheFromMatrix,
  viewportCelldata,
  viewportRangeFromScroll,
} from "./viewportCache";

type UseExcelGridWorkspaceProps = {
  workspaceId: number | null;
  workbook: WorkbookFull | null;
  workbookRevision: number;
  currentSheetIndex: number;
  onSheetIndexChange?: (sheetIndex: number) => void;
  onWorkbookDelete?: (workbookId: number) => void;
  onWorkbookStructureChanged?: (update: WorkbookStructureUpdate) => void;
  onWorkbookRefresh?: () => Promise<void> | void;
  onRegisterSheetMutationHandler?: (
    handler: ((update: SheetPatchUpdate) => Promise<void> | void) | null,
  ) => void;
};

function operationRanges(operation: DocumentOperation): CellRange[] {
  switch (operation.type) {
    case "setCell":
      return [
        {
          startRow: operation.row,
          startCol: operation.col,
          endRow: operation.row,
          endCol: operation.col,
        },
      ];
    case "setRangeValues":
    case "setRangeStyle":
    case "clearRange":
      return [operation.range];
    default:
      return [];
  }
}

function rangesOverlap(left: CellRange, right: CellRange): boolean {
  return !(
    left.endRow < right.startRow ||
    right.endRow < left.startRow ||
    left.endCol < right.startCol ||
    right.endCol < left.startCol
  );
}

function createRequestKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
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
  onRegisterSheetMutationHandler,
}: UseExcelGridWorkspaceProps) {
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "conflict">("idle");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStatusResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveChainRef = useRef(Promise.resolve());
  const lastSavedSnapshotRef = useRef<Record<number, string>>({});
  const lastSavedCelldataRef = useRef<Record<number, FortuneCell[]>>({});
  const lastSavedConfigRef = useRef<Record<number, unknown>>({});
  const lastSavedRevisionRef = useRef<Record<number, number>>({});
  const workbookRef = useRef<WorkbookInstance>(null);
  const gridRootRef = useRef<HTMLDivElement>(null);
  const viewportCacheRef = useRef<Record<number, ReturnType<typeof createViewportCache>>>({});
  const pendingViewportChunksRef = useRef<Record<number, Set<string>>>({});
  const viewportGenerationRef = useRef(0);
  const viewportRequestSequenceRef = useRef(0);
  const viewportChunkRequestRef = useRef<Record<number, Record<string, number>>>({});
  const lastViewportRangeRef = useRef<Record<number, CellRange>>({});
  const renderedViewportKeyRef = useRef<Record<number, string>>({});
  const pendingProgrammaticChangesRef = useRef<Record<number, string[]>>({});
  const { sheetData, sessionKey } = useWorkbookEditorSession(workbook, workbookRevision);
  const { registerActivateSheet } = useSheetActivation();

  const getSnapshot = useCallback((celldata: unknown[], config: unknown) => {
    return JSON.stringify({ celldata, config });
  }, []);

  const updateRenderedSheet = useCallback(
    (sheetId: number) => {
      const instance = workbookRef.current;
      const sourceSheet = workbook?.sheets.find((sheet) => sheet.id === sheetId);
      const cache = viewportCacheRef.current[sheetId];
      if (!instance || !sourceSheet || !cache) return;

      const renderedCells = viewportCelldata(cache);
      const row = Math.max(sourceSheet.maxRow ?? 0, cache.maxRow, 128) + 1;
      const column = Math.max(sourceSheet.maxColumn ?? 0, cache.maxColumn, 64);
      const renderedKey = getSnapshot(renderedCells, { row, column });
      if (renderedViewportKeyRef.current[sheetId] === renderedKey) return;
      const updates = buildFortuneSheetViewportUpdates(
        instance.getAllSheets(),
        sheetId,
        renderedCells,
        row,
        column,
      );
      if (updates.length === 0) return;

      const expectedSnapshot = getSnapshot(renderedCells, extractSheetConfig(updates[0]));
      const pending = pendingProgrammaticChangesRef.current[sheetId] ?? [];
      pending.push(expectedSnapshot);
      pendingProgrammaticChangesRef.current[sheetId] = pending;
      instance.updateSheet(updates);
      renderedViewportKeyRef.current[sheetId] = renderedKey;
      lastSavedCelldataRef.current[sheetId] = renderedCells;
      lastSavedRevisionRef.current[sheetId] = cache.revision;
    },
    [getSnapshot, workbook],
  );

  const loadViewport = useCallback(
    async (
      sheetId: number,
      range: { startRow: number; startCol: number; endRow: number; endCol: number },
    ) => {
      if (workspaceId == null) return;
      const sheet = workbook?.sheets.find((item) => item.id === sheetId);
      if (!sheet) return;
      const generation = viewportGenerationRef.current;
      lastViewportRangeRef.current[sheetId] = range;

      let cache = viewportCacheRef.current[sheetId];
      if (!cache) {
        cache = createViewportCache();
        viewportCacheRef.current[sheetId] = cache;
      }
      let pending = pendingViewportChunksRef.current[sheetId];
      if (!pending) {
        pending = new Set<string>();
        pendingViewportChunksRef.current[sheetId] = pending;
      }
      const missing = missingChunksForRange(cache, range).filter((key) => !pending.has(key));
      if (missing.length === 0) {
        return;
      }
      const requestId = viewportRequestSequenceRef.current + 1;
      viewportRequestSequenceRef.current = requestId;
      const latestRequests = viewportChunkRequestRef.current[sheetId] ?? {};
      viewportChunkRequestRef.current[sheetId] = latestRequests;
      for (const key of missing) latestRequests[key] = requestId;
      for (const key of missing) pending.add(key);

      try {
        const result = await fetchDocumentRange(workspaceId, sheetId, rangeToA1(range));
        if (
          generation !== viewportGenerationRef.current ||
          viewportCacheRef.current[sheetId] !== cache ||
          missing.some((key) => latestRequests[key] !== requestId)
        ) {
          return;
        }
        mergeDocumentRange(cache, result, sheet.columns);
        updateRenderedSheet(sheetId);
      } catch (error) {
        console.error("加载工作表视口失败:", error);
      } finally {
        for (const key of missing) pending.delete(key);
      }
    },
    [updateRenderedSheet, workbook, workspaceId],
  );

  const handleSheetMutation = useCallback(
    async (update: SheetPatchUpdate) => {
      const mutation = update.mutation;
      if (!mutation) {
        await onWorkbookRefresh?.();
        return;
      }

      const sheet = workbook?.sheets.find((item) => item.id === mutation.sheetId);
      if (!sheet) {
        await onWorkbookRefresh?.();
        return;
      }

      let cache = viewportCacheRef.current[mutation.sheetId];
      if (!cache) {
        cache = createViewportCache();
        viewportCacheRef.current[mutation.sheetId] = cache;
      }
      const requestedRanges = mutation.changedRanges.map(expandRangeToChunks);
      const ranges =
        requestedRanges.length > 0
          ? requestedRanges
          : [
              lastViewportRangeRef.current[sheet.id] ??
                viewportRangeFromScroll(0, 0, sheet.maxRow ?? 0, sheet.maxColumn ?? 0),
            ];
      invalidateDocumentRanges(cache, ranges);
      renderedViewportKeyRef.current[mutation.sheetId] = "";

      if (sheet.id !== workbook?.sheets[currentSheetIndex]?.id) return;
      for (const range of ranges) {
        await loadViewport(sheet.id, range);
      }
    },
    [currentSheetIndex, loadViewport, onWorkbookRefresh, workbook],
  );

  const refreshDocumentRanges = useCallback(
    async (sheetId: number, ranges: CellRange[]) => {
      const sheet = workbook?.sheets.find((item) => item.id === sheetId);
      if (!sheet) return;
      let cache = viewportCacheRef.current[sheetId];
      if (!cache) {
        cache = createViewportCache();
        viewportCacheRef.current[sheetId] = cache;
      }
      const requestedRanges = (
        ranges.length > 0
          ? ranges
          : [
              lastViewportRangeRef.current[sheetId] ??
                viewportRangeFromScroll(0, 0, sheet.maxRow ?? 0, sheet.maxColumn ?? 0),
            ]
      ).map(expandRangeToChunks);
      invalidateDocumentRanges(cache, requestedRanges);
      renderedViewportKeyRef.current[sheetId] = "";
      for (const range of requestedRanges) {
        await loadViewport(sheetId, range);
      }
    },
    [loadViewport, workbook],
  );

  useEffect(() => {
    if (!workbook) return;

    viewportCacheRef.current = {};
    pendingViewportChunksRef.current = {};
    viewportGenerationRef.current += 1;
    viewportRequestSequenceRef.current = 0;
    viewportChunkRequestRef.current = {};
    lastViewportRangeRef.current = {};
    renderedViewportKeyRef.current = {};
    pendingProgrammaticChangesRef.current = {};

    const nextSnapshots: Record<number, string> = {};
    workbook.sheets.forEach((sheet) => {
      const fd = toFortuneSheetData(sheet);
      nextSnapshots[sheet.id] = getSnapshot(fd.celldata, extractSheetConfig(fd));
      lastSavedCelldataRef.current[sheet.id] = fd.celldata;
      lastSavedConfigRef.current[sheet.id] = extractSheetConfig(fd);
      lastSavedRevisionRef.current[sheet.id] = sheet.documentRevision ?? 0;
    });

    lastSavedSnapshotRef.current = nextSnapshots;
  }, [getSnapshot, workbook, workbookRevision]);

  useEffect(() => {
    onRegisterSheetMutationHandler?.(handleSheetMutation);
    return () => onRegisterSheetMutationHandler?.(null);
  }, [handleSheetMutation, onRegisterSheetMutationHandler]);

  useEffect(() => {
    const sheet = workbook?.sheets[currentSheetIndex];
    if (!sheet) return;
    void loadViewport(
      sheet.id,
      viewportRangeFromScroll(0, 0, sheet.maxRow ?? 0, sheet.maxColumn ?? 0),
    );
  }, [currentSheetIndex, loadViewport, workbook]);

  useEffect(() => {
    const sheet = workbook?.sheets[currentSheetIndex];
    const root = gridRootRef.current;
    if (!sheet || !root) return;

    const scrollbars = root.querySelectorAll<HTMLElement>(
      ".luckysheet-scrollbar-x, .luckysheet-scrollbar-y",
    );
    if (scrollbars.length === 0) return;

    let frame: number | null = null;
    const requestViewport = () => {
      if (frame != null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        const horizontal = root.querySelector<HTMLElement>(".luckysheet-scrollbar-x");
        const vertical = root.querySelector<HTMLElement>(".luckysheet-scrollbar-y");
        void loadViewport(
          sheet.id,
          viewportRangeFromScroll(
            vertical?.scrollTop ?? 0,
            horizontal?.scrollLeft ?? 0,
            Math.max(sheet.maxRow ?? 0, viewportCacheRef.current[sheet.id]?.maxRow ?? 0),
            Math.max(sheet.maxColumn ?? 0, viewportCacheRef.current[sheet.id]?.maxColumn ?? 0),
          ),
        );
      });
    };

    for (const scrollbar of scrollbars) scrollbar.addEventListener("scroll", requestViewport);
    return () => {
      for (const scrollbar of scrollbars) scrollbar.removeEventListener("scroll", requestViewport);
      if (frame != null) cancelAnimationFrame(frame);
    };
  }, [currentSheetIndex, loadViewport, sessionKey, sheetData, workbook]);

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
    async (celldata: FortuneCell[], config: unknown) => {
      if (!workbook?.sheets[currentSheetIndex] || workspaceId == null) return;

      setSaveStatus("saving");
      try {
        const sheet = workbook.sheets[currentSheetIndex];
        const previousCelldata = lastSavedCelldataRef.current[sheet.id] ?? [];
        const operations = buildDocumentOperations(
          previousCelldata,
          celldata,
          sheet.columns.length > 0 ? 1 : 0,
        );
        let revision = lastSavedRevisionRef.current[sheet.id] ?? sheet.documentRevision ?? 0;
        const previousConfig = lastSavedConfigRef.current[sheet.id];
        const configChanged = valueKey(previousConfig) !== valueKey(config);
        if (operations.length > 0) {
          const idempotencyKey = createRequestKey();
          const styles = [...collectDocumentStyles(celldata)].map(([id, style]) => ({ id, style }));
          let result: Awaited<ReturnType<typeof applyDocumentOperations>>;
          try {
            result = await applyDocumentOperations(
              workspaceId,
              sheet.id,
              operations,
              revision,
              styles,
              undefined,
              idempotencyKey,
            );
          } catch (error) {
            if (!(error instanceof DocumentRevisionConflictError)) throw error;
            const localRanges = operations.flatMap(operationRanges);
            const overlapsRemoteChange = error.changedRanges.some((remoteRange) =>
              localRanges.some((localRange) => rangesOverlap(localRange, remoteRange)),
            );
            if (overlapsRemoteChange || (error.changedRanges.length === 0 && configChanged)) {
              await refreshDocumentRanges(sheet.id, localRanges);
              throw error;
            }
            result = await applyDocumentOperations(
              workspaceId,
              sheet.id,
              operations,
              error.currentRevision,
              styles,
              undefined,
              idempotencyKey,
            );
          }
          revision = result.revision;
        }
        if (configChanged) {
          const result = await applyDocumentLayout(
            workspaceId,
            sheet.id,
            config,
            revision,
            undefined,
            createRequestKey(),
          );
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
        if (error instanceof DocumentRevisionConflictError) {
          await onWorkbookRefresh?.();
          if (saveStatusResetRef.current) clearTimeout(saveStatusResetRef.current);
          setSaveStatus("conflict");
          saveStatusResetRef.current = setTimeout(() => setSaveStatus("idle"), 5000);
          console.warn("保存时检测到工作表版本冲突，已重新加载最新数据。", error);
        }
        setSaveStatus("idle");
        console.error("保存失败:", error);
      }
    },
    [
      currentSheetIndex,
      getSnapshot,
      onWorkbookRefresh,
      refreshDocumentRanges,
      workbook,
      workspaceId,
    ],
  );

  const scheduleSave = useCallback(
    (celldata: FortuneCell[], config: unknown) => {
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
    (data: FortuneSheetRuntime[]) => {
      if (!workbook || !Array.isArray(data)) return;
      const sheet = workbook.sheets[currentSheetIndex];
      if (!sheet) return;
      const fortuneSheet = data.find((item) => String(item.id) === String(sheet.id));
      if (!fortuneSheet) return;

      const cellMatrix = fortuneSheet.data;
      if (!Array.isArray(cellMatrix)) return;
      const celldata = matrixToCelldata(cellMatrix);
      let cache = viewportCacheRef.current[sheet.id];
      if (!cache) {
        cache = createViewportCache();
        viewportCacheRef.current[sheet.id] = cache;
      }
      const headerRows = sheet.columns.length > 0 ? 1 : 0;
      for (const cell of celldata) {
        cache.maxRow = Math.max(
          cache.maxRow,
          Math.max(0, rendererRowToDocumentRow(cell.r, headerRows) + 1),
        );
        cache.maxColumn = Math.max(cache.maxColumn, cell.c + 1);
      }
      syncViewportCacheFromMatrix(cache, cellMatrix, headerRows);
      const config = extractSheetConfig(fortuneSheet);
      const snapshot = getSnapshot(celldata, config);
      const pending = pendingProgrammaticChangesRef.current[sheet.id];
      if (pending?.includes(snapshot)) {
        delete pendingProgrammaticChangesRef.current[sheet.id];
        return;
      }
      if (pending) delete pendingProgrammaticChangesRef.current[sheet.id];
      scheduleSave(celldata, config);
    },
    [currentSheetIndex, getSnapshot, scheduleSave, workbook],
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

  const handleDownload = useCallback(async () => {
    if (!workbook || workspaceId == null) return;
    await downloadWorkbook(workspaceId, workbook.id, workbook.name);
  }, [workbook, workspaceId]);

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
    gridRootRef,
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
