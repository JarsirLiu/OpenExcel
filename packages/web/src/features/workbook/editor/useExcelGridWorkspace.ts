import type { WorkbookInstance } from "@fortune-sheet/react";
import {
  collectDocumentStyles,
  extractSheetConfig,
  type FortuneCell,
  matrixToCelldata,
} from "@openexcel/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { applyDocumentLayout, applyDocumentOperations, fetchDocumentRange } from "@/api/documents";
import type { WorkbookFull } from "@/api/workbooks";
import {
  createSheet,
  deleteSheet,
  deleteWorkbook,
  downloadWorkbook,
  updateSheetName,
} from "@/api/workbooks";
import type { WorkbookStructureUpdate } from "@/features/chat/hooks/useSheetPatchSync";
import { confirm } from "@/shared/lib";
import { buildDocumentOperations, valueKey } from "./documentSync";
import { toFortuneSheetData } from "./fortuneSheet";
import { useSheetActivation } from "./SheetActivationContext";
import { useWorkbookEditorSession } from "./useWorkbookEditorSession";
import {
  createViewportCache,
  mergeDocumentRange,
  missingChunksForRange,
  rangeToA1,
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
};

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
  const gridRootRef = useRef<HTMLDivElement>(null);
  const viewportCacheRef = useRef<Record<number, ReturnType<typeof createViewportCache>>>({});
  const pendingViewportChunksRef = useRef<Record<number, Set<string>>>({});
  const { sheetData, sessionKey } = useWorkbookEditorSession(workbook, workbookRevision);
  const { registerActivateSheet } = useSheetActivation();

  const getSnapshot = useCallback((celldata: any[], config: any) => {
    return JSON.stringify({ celldata, config });
  }, []);

  const updateRenderedSheet = useCallback(
    (sheetId: number) => {
      const instance = workbookRef.current;
      const sourceSheet = workbook?.sheets.find((sheet) => sheet.id === sheetId);
      const cache = viewportCacheRef.current[sheetId];
      if (!instance || !sourceSheet || !cache) return;

      const renderedCells = viewportCelldata(cache);
      const allSheets = instance.getAllSheets() as any[];
      instance.updateSheet(
        allSheets.map((sheet) =>
          String(sheet.id) === String(sheetId)
            ? {
                ...sheet,
                celldata: renderedCells,
                row: Math.max(sourceSheet.maxRow ?? 0, cache.maxRow, 128) + 1,
                column: Math.max(sourceSheet.maxColumn ?? 0, cache.maxColumn, 64),
              }
            : sheet,
        ),
      );
      lastSavedCelldataRef.current[sheetId] = renderedCells;
      lastSavedRevisionRef.current[sheetId] = cache.revision;
    },
    [workbook],
  );

  const loadViewport = useCallback(
    async (
      sheetId: number,
      range: { startRow: number; startCol: number; endRow: number; endCol: number },
    ) => {
      if (workspaceId == null) return;
      const sheet = workbook?.sheets.find((item) => item.id === sheetId);
      if (!sheet) return;

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
        updateRenderedSheet(sheetId);
        return;
      }
      for (const key of missing) pending.add(key);

      try {
        const result = await fetchDocumentRange(workspaceId, sheetId, rangeToA1(range));
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

  useEffect(() => {
    if (!workbook) return;

    viewportCacheRef.current = {};
    pendingViewportChunksRef.current = {};

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
          const result = await applyDocumentOperations(
            workspaceId,
            sheet.id,
            operations,
            revision,
            [...collectDocumentStyles(celldata as FortuneCell[])].map(([id, style]) => ({
              id,
              style,
            })),
            undefined,
            createRequestKey(),
          );
          revision = result.revision;
        }
        const previousConfig = lastSavedConfigRef.current[sheet.id];
        if (valueKey(previousConfig) !== valueKey(config)) {
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
      let cache = viewportCacheRef.current[sheet.id];
      if (!cache) {
        cache = createViewportCache();
        viewportCacheRef.current[sheet.id] = cache;
      }
      const headerRows = sheet.columns.length > 0 ? 1 : 0;
      for (const cell of celldata) {
        cache.maxRow = Math.max(cache.maxRow, Math.max(0, cell.r - headerRows + 1));
        cache.maxColumn = Math.max(cache.maxColumn, cell.c + 1);
      }
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
