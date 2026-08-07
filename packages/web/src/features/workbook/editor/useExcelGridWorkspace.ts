import type { WorkbookInstance } from "@fortune-sheet/react";
import type { FortuneCell, SheetChangeDelta, SheetChangeVersion } from "@openexcel/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkbookFull } from "@/api/workbooks";
import { fetchSheet } from "@/api/workbooks";
import type { SheetSnapshotForSave } from "@/features/sync/sheetChunkSnapshot";
import type {
  CommittedSheetContentChangeHandler,
  CommittedSheetMutationHandler,
  SheetContentChangeHandler,
  SheetEditorChange,
} from "@/features/sync/sheetEditorChange";
import type { WorkbookStructureUpdate } from "@/features/sync/types";
import { useSheetSaveController } from "@/features/sync/useSheetSaveController";
import { normalizeSheetIndex } from "@/features/workspace/sheetIndex";
import type { WorkbookDocumentStore } from "@/features/workspace/WorkbookDocumentStore";
import { adaptFortuneSheetLayout, type SheetGridLayout } from "../layout/fortuneSheetLayout";
import { findSheetIndexById } from "../sheetIdentity";
import { AiSheetEditor } from "./aiSheetEditor";
import type { FortuneSheetOp } from "./fortuneSheetOps";
import { ManualSheetEditor } from "./manualSheetEditor";
import { useSheetActivation } from "./SheetActivationContext";
import { useWorkbookEditorSession } from "./useWorkbookEditorSession";
import { useWorkbookStructureActions } from "./useWorkbookStructureActions";

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
  onCommittedSheetContentChanged?: CommittedSheetContentChangeHandler;
  onRegisterCommittedSheetMutation?: (handler: CommittedSheetMutationHandler | null) => void;
  documentStore: WorkbookDocumentStore;
  sheetLoaded: boolean;
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
  onCommittedSheetContentChanged,
  onRegisterCommittedSheetMutation,
  documentStore,
  sheetLoaded,
}: UseExcelGridWorkspaceProps) {
  const workbookRef = useRef<WorkbookInstance>(null);
  const { sheetData, sessionKey } = useWorkbookEditorSession(workbook, workbookRevision);
  const { registerActivateSheet } = useSheetActivation();
  const manualEditorRef = useRef<ManualSheetEditor | null>(null);
  const aiEditorRef = useRef<AiSheetEditor | null>(null);
  const editorSessionReadyRef = useRef<string | null>(null);
  if (!manualEditorRef.current) manualEditorRef.current = new ManualSheetEditor();
  const applyDocumentChange = useCallback(
    (change: SheetEditorChange) => {
      return onSheetContentChanged?.(change);
    },
    [onSheetContentChanged],
  );
  const replaceManualBaselineAfterSave = useCallback(
    (sheetId: number, snapshot: Parameters<ManualSheetEditor["replaceFromServerSnapshot"]>[1]) => {
      manualEditorRef.current?.replaceFromServerSnapshot(sheetId, snapshot);
    },
    [],
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
  const layoutSessionKey = `${workbook?.id ?? "none"}:${sessionKey}`;
  const activeSheetIndex = normalizeSheetIndex(currentSheetIndex, workbook?.sheets.length ?? 0);
  const workbookStateRef = useRef(workbook);
  const activeSheetIndexRef = useRef(activeSheetIndex);
  const sheetLoadedRef = useRef(sheetLoaded);
  const editorSessionRef = useRef(sessionKey);
  workbookStateRef.current = documentStore.getSnapshot() ?? workbook;
  activeSheetIndexRef.current = activeSheetIndex;
  sheetLoadedRef.current = sheetLoaded;

  const {
    handleBeforeAddSheet,
    handleBeforeDeleteSheet,
    handleBeforeUpdateSheetName,
    handleDeleteWorkbook,
  } = useWorkbookStructureActions({
    workspaceId,
    workbook,
    onWorkbookDelete,
    onWorkbookStructureChanged,
    onWorkbookRefresh,
    onWorkbookMutation,
  });
  if (editorSessionRef.current !== sessionKey) {
    editorSessionRef.current = sessionKey;
    editorSessionReadyRef.current = null;
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
  if (!aiEditorRef.current) {
    aiEditorRef.current = new AiSheetEditor({
      getWorkbook: () => workbookStateRef.current,
      getWorkbookInstance: () => workbookRef.current,
      applyCommittedDocument: (change, revision) => {
        onCommittedSheetContentChanged?.(change, revision);
      },
      replaceManualBaselineFromServer: async (sheetId) => {
        if (workspaceId == null) throw new Error("The workspace is not ready");
        const serverSheet = await fetchSheet(workspaceId, sheetId);
        const snapshot = {
          celldata: (serverSheet.uploadedData ?? []) as FortuneCell[],
          config: serverSheet.config,
        };
        manualEditorRef.current?.replaceFromServerSnapshot(sheetId, snapshot);
        synchronizeServerSnapshot(sheetId, snapshot);
      },
      replaceManualBaselineFromServerSnapshot: (sheetId, snapshot) => {
        manualEditorRef.current?.replaceFromServerSnapshot(sheetId, snapshot);
      },
      synchronizeSaveBaselineFromServerSnapshot: synchronizeServerSnapshot,
      updateCommittedRevision: (sheetId, revision) => {
        onSheetRevisionChanged?.(sheetId, revision);
      },
    });
  }
  useEffect(() => {
    if (workbook) manualEditorRef.current?.reset(sheetData);
  }, [workbook?.id]);

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
    if (!workbook || !manualEditorRef.current) return;
    for (const sheet of workbook.sheets) {
      const snapshot = getSheetSaveSnapshot(sheet, manualEditorRef.current);
      if (snapshot) manualEditorRef.current.replaceFromServerSnapshot(sheet.id, snapshot);
    }
  }, [sheetLifecycleKeyValue, workbook?.id]);

  useEffect(() => {
    if (!workbook || !manualEditorRef.current) return;
    for (const sheet of workbook.sheets) {
      const snapshot = getSheetSaveSnapshot(sheet, manualEditorRef.current);
      if (!snapshot) continue;
      synchronizeSaveSheet(
        sheet.id,
        { workbookId: workbook.id, lifecycleKey: sheetLifecycleKey(sheet) },
        snapshot,
      );
    }
  }, [sheetLifecycleKeyValue, synchronizeSaveSheet, workbook?.id]);

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
      if (editorSessionReadyRef.current !== sessionKey) return;
      const currentWorkbook = workbookStateRef.current;
      const currentSheetIndex = activeSheetIndexRef.current;
      if (!sheetLoadedRef.current || !currentWorkbook || !Array.isArray(data)) return;

      const sheet = currentWorkbook.sheets[currentSheetIndex];
      if (!sheet) return;
      const manualEditor = manualEditorRef.current;
      if (!manualEditor) return;
      const loadedSheetIds = new Set(
        currentWorkbook.sheets.filter((item) => item.loaded !== false).map((item) => item.id),
      );
      const loadedData = data.filter((fortuneSheet) => {
        const id = Number(fortuneSheet?.id);
        return Number.isInteger(id) && loadedSheetIds.has(id);
      });
      const results = manualEditor.handleChange(data, sheet.id, loadedSheetIds);
      if (results.length === 0) return;

      const layoutChanged = results.some(
        ({ change }) =>
          change?.kind === "snapshot" ||
          (change?.kind === "patch" && change.changeSet.configChanges.length > 0),
      );
      if (layoutChanged) {
        setLayoutState((current) => {
          const bySheetId =
            current.sessionKey === layoutSessionKey
              ? { ...current.bySheetId }
              : { ...initialLayouts };
          let changed = current.sessionKey !== layoutSessionKey;
          for (const fortuneSheet of loadedData) {
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
    },
    [
      applyDocumentChange,
      documentStore,
      initialLayouts,
      layoutSessionKey,
      scheduleSave,
      sessionKey,
    ],
  );

  const handleCommittedSheetMutation = useCallback<CommittedSheetMutationHandler>(
    (sheetId: number, delta: SheetChangeDelta, version: SheetChangeVersion) => {
      return (
        aiEditorRef.current?.applyCommittedMutation(sheetId, delta, version) ??
        Promise.reject(new Error("The AI sheet editor is not ready"))
      );
    },
    [],
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
    manualEditorRef.current?.recordOperation(ops, activeSheet.id);
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
