import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkbookFull } from "@/api/workbooks";
import { toast } from "@/shared/lib";
import { normalizeSheetIndex } from "./sheetIndex";

const SHEET_STORAGE_KEY = "openexcel:sheetIdx";

function storageKey(workspaceId: number | null, workbookId: number | null): string | null {
  return workspaceId == null || workbookId == null
    ? null
    : `${SHEET_STORAGE_KEY}:${workspaceId}:${workbookId}`;
}

function loadStoredSheetIdx(workspaceId: number | null, workbookId: number | null): number {
  const key = storageKey(workspaceId, workbookId);
  if (!key) return 0;
  try {
    const stored = sessionStorage.getItem(key);
    const parsed = stored === null ? 0 : Number(stored);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
  } catch {
    return 0;
  }
}

function saveSheetIdx(workspaceId: number | null, workbookId: number | null, index: number): void {
  const key = storageKey(workspaceId, workbookId);
  if (!key) return;
  try {
    sessionStorage.setItem(key, String(index));
  } catch {
    // Ignore unavailable session storage.
  }
}

export function useSheetNavigation(
  workspaceId: number | null,
  workbook: WorkbookFull | null,
  loadSheet: (sheetId: number) => Promise<WorkbookFull | null>,
) {
  const [currentSheetIndex, setCurrentSheetIndexState] = useState(() =>
    loadStoredSheetIdx(workspaceId, workbook?.id ?? null),
  );
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetLoadError, setSheetLoadError] = useState<string | null>(null);
  const hasMountedRef = useRef(false);
  const previousWorkbookIdRef = useRef<number | null>(workbook?.id ?? null);

  useEffect(() => {
    if (!workbook) return;
    if (hasMountedRef.current && previousWorkbookIdRef.current !== workbook.id) {
      setCurrentSheetIndexState(loadStoredSheetIdx(workspaceId, workbook.id));
      setSheetLoadError(null);
    }
    previousWorkbookIdRef.current = workbook.id;
    hasMountedRef.current = true;
    setCurrentSheetIndexState((current) => normalizeSheetIndex(current, workbook.sheets.length));
  }, [workbook, workspaceId]);

  const ensureSheetLoaded = useCallback(
    async (sheetIndex: number, options?: { quiet?: boolean }) => {
      const quiet = options?.quiet === true;
      const current = workbook;
      if (!current || workspaceId == null) return;
      const sheet = current.sheets[sheetIndex];
      if (sheet?.loaded !== false) {
        if (!quiet) {
          setSheetLoading(false);
          setSheetLoadError(null);
        }
        return;
      }

      if (!quiet) {
        setSheetLoading(true);
        setSheetLoadError(null);
      }
      try {
        await loadSheet(sheet.id);
      } catch (error) {
        if (!quiet) {
          const message = error instanceof Error ? error.message : "加载工作表失败";
          setSheetLoadError(message);
          toast({ message, variant: "error" });
        }
        if (quiet) throw error;
      } finally {
        if (!quiet) setSheetLoading(false);
      }
    },
    [loadSheet, workspaceId, workbook],
  );

  const setCurrentSheetIndex = useCallback(
    (nextIndex: number) => {
      const safeIndex = normalizeSheetIndex(nextIndex, workbook?.sheets.length ?? 0);
      setCurrentSheetIndexState(safeIndex);
      saveSheetIdx(workspaceId, workbook?.id ?? null, safeIndex);
      void ensureSheetLoaded(safeIndex);
    },
    [ensureSheetLoaded, workbook?.id, workbook?.sheets.length, workspaceId],
  );

  const loadSheetById = useCallback(
    async (sheetId: number) => {
      const index = workbook?.sheets.findIndex((sheet) => sheet.id === sheetId) ?? -1;
      if (index >= 0) await ensureSheetLoaded(index, { quiet: true });
    },
    [ensureSheetLoaded, workbook?.sheets],
  );

  useEffect(() => {
    void ensureSheetLoaded(currentSheetIndex);
  }, [
    currentSheetIndex,
    ensureSheetLoaded,
    workbook?.id,
    workbook?.sheets[currentSheetIndex]?.loaded,
  ]);

  return {
    currentSheetIndex,
    setCurrentSheetIndex,
    sheetLoading,
    sheetLoadError,
    retryCurrentSheet: () => void ensureSheetLoaded(currentSheetIndex),
    loadSheetById,
  };
}
