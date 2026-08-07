import type { FortuneCell } from "@openexcel/core";
import { useCallback, useEffect, useRef } from "react";
import type { WorkbookFull } from "@/api/workbooks";
import type { SheetSnapshotForSave } from "@/features/sync/sheetChunkSnapshot";
import type {
  SheetContentChangeHandler,
  SheetEditorChange,
} from "@/features/sync/sheetEditorChange";
import { useSheetSaveController } from "@/features/sync/useSheetSaveController";
import type { WorkbookDocumentStore } from "@/features/workspace/WorkbookDocumentStore";
import type { FortuneSheetLayoutSource } from "../layout/fortuneSheetLayout";
import type { FortuneSheetData } from "./fortuneSheet";
import type { FortuneSheetOp } from "./fortuneSheetOps";
import { ManualSheetEditor } from "./manualSheetEditor";

type NormalizedSheetChange = {
  id: string | number;
  data: readonly (Readonly<Record<string, unknown>> | null)[][];
};

export type ManualSheetChangeData = readonly (FortuneSheetLayoutSource & {
  id?: string | number;
  data?: unknown;
})[];

function normalizeSheetChangeData(data: ManualSheetChangeData): NormalizedSheetChange[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((sheet) => {
    if (
      (typeof sheet.id !== "string" && typeof sheet.id !== "number") ||
      !Array.isArray(sheet.data)
    ) {
      return [];
    }
    return [
      {
        id: sheet.id,
        data: sheet.data as readonly (Readonly<Record<string, unknown>> | null)[][],
      },
    ];
  });
}

type Props = {
  workspaceId: number | null;
  workbook: WorkbookFull | null;
  sheetData: readonly FortuneSheetData[];
  sessionKey: string;
  currentSheetIndex: number;
  sheetLoaded: boolean;
  documentStore: WorkbookDocumentStore;
  onSheetContentChanged?: SheetContentChangeHandler;
  onSheetRevisionChanged?: (
    sheetId: number,
    revision: number,
    persistedThroughVersion?: number,
  ) => void;
};

type EditorSheet = WorkbookFull["sheets"][number];

function sheetLifecycleKey(sheet: EditorSheet): string {
  return `${sheet.id}:${sheet.loaded === false ? "unloaded" : "loaded"}`;
}

function getSheetSaveSnapshot(
  sheet: EditorSheet,
  manualEditor: ManualSheetEditor,
): SheetSnapshotForSave | null {
  if (sheet.loaded !== false && Array.isArray(sheet.uploadedData)) {
    return {
      celldata: sheet.uploadedData as FortuneCell[],
      config: sheet.config,
    };
  }
  return manualEditor.getBaseline(sheet.id);
}

export function useManualSheetSync({
  workspaceId,
  workbook,
  sheetData,
  sessionKey,
  currentSheetIndex,
  sheetLoaded,
  documentStore,
  onSheetContentChanged,
  onSheetRevisionChanged,
}: Props) {
  const manualEditorRef = useRef<ManualSheetEditor | null>(null);
  const editorSessionReadyRef = useRef<string | null>(null);
  const workbookRef = useRef(workbook);
  const activeSheetIndexRef = useRef(currentSheetIndex);
  const sheetLoadedRef = useRef(sheetLoaded);

  if (!manualEditorRef.current) manualEditorRef.current = new ManualSheetEditor();
  workbookRef.current = documentStore.getSnapshot() ?? workbook;
  activeSheetIndexRef.current = currentSheetIndex;
  sheetLoadedRef.current = sheetLoaded;

  const manualEditor = manualEditorRef.current;
  const applyDocumentChange = useCallback(
    (change: SheetEditorChange) => onSheetContentChanged?.(change),
    [onSheetContentChanged],
  );
  const replaceManualBaselineAfterSave = useCallback(
    (sheetId: number, snapshot: SheetSnapshotForSave) => {
      manualEditor.replaceFromServerSnapshot(sheetId, snapshot);
    },
    [manualEditor],
  );
  const {
    saveStatus,
    schedule: scheduleSave,
    synchronizeServerSnapshot,
    synchronizeSheet: synchronizeSaveSheet,
  } = useSheetSaveController({
    workspaceId,
    sheetLoaded,
    getDocumentVersion: documentStore.getSheetChangeVersion,
    getSheetState: (sheetId) => {
      const sheet = documentStore.getSnapshot()?.sheets.find((item) => item.id === sheetId);
      if (!sheet) return null;
      return {
        revision: sheet.revision,
        celldata: (sheet.uploadedData ?? []) as FortuneCell[],
        config: sheet.config,
      };
    },
    onRevisionChanged: onSheetRevisionChanged,
    onServerSnapshot: replaceManualBaselineAfterSave,
    onRebasedChange: applyDocumentChange,
  });

  useEffect(() => {
    if (workbook) manualEditor.reset(sheetData);
  }, [manualEditor, workbook?.id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      editorSessionReadyRef.current = sessionKey;
    }, 0);
    return () => clearTimeout(timer);
  }, [sessionKey]);

  const sheetLifecycleKeyValue = workbook
    ? workbook.sheets.map(sheetLifecycleKey).join(",")
    : "none";

  useEffect(() => {
    if (!workbook) return;
    for (const sheet of workbook.sheets) {
      const snapshot = getSheetSaveSnapshot(sheet, manualEditor);
      if (snapshot) manualEditor.replaceFromServerSnapshot(sheet.id, snapshot);
    }
  }, [manualEditor, sheetLifecycleKeyValue, workbook?.id]);

  useEffect(() => {
    if (!workbook) return;
    for (const sheet of workbook.sheets) {
      const snapshot = getSheetSaveSnapshot(sheet, manualEditor);
      if (!snapshot) continue;
      synchronizeSaveSheet(
        sheet.id,
        { workbookId: workbook.id, lifecycleKey: sheetLifecycleKey(sheet) },
        snapshot,
      );
    }
  }, [manualEditor, sheetLifecycleKeyValue, synchronizeSaveSheet, workbook?.id]);

  const handleChange = useCallback(
    (data: ManualSheetChangeData) => {
      if (editorSessionReadyRef.current !== sessionKey) return [];
      const currentWorkbook = workbookRef.current;
      const activeSheet = currentWorkbook?.sheets[activeSheetIndexRef.current];
      if (!sheetLoadedRef.current || !currentWorkbook || !activeSheet) return [];

      const loadedSheetIds = new Set(
        currentWorkbook.sheets.filter((item) => item.loaded !== false).map((item) => item.id),
      );
      const results = manualEditor.handleChange(
        normalizeSheetChangeData(data),
        activeSheet.id,
        loadedSheetIds,
      );
      for (const result of results) {
        if (!result.change) continue;
        applyDocumentChange(result.change);
        scheduleSave(result.change, documentStore.getSheetChangeVersion(result.sheetId));
      }
      return results;
    },
    [applyDocumentChange, documentStore, manualEditor, scheduleSave, sessionKey],
  );

  const handleOp = useCallback(
    (ops: readonly FortuneSheetOp[]) => {
      const activeSheet = workbookRef.current?.sheets[activeSheetIndexRef.current];
      if (activeSheet) manualEditor.recordOperation(ops, activeSheet.id);
    },
    [manualEditor],
  );

  return {
    manualEditor,
    saveStatus,
    handleChange,
    handleOp,
    replaceManualBaselineFromServerSnapshot: replaceManualBaselineAfterSave,
    synchronizeServerSnapshot,
  };
}
