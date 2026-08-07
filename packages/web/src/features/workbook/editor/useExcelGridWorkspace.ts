import type { WorkbookInstance } from "@fortune-sheet/react";
import type { SheetChangeDelta, SheetChangeVersion } from "@openexcel/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkbookFull } from "@/api/workbooks";
import { fetchSheet } from "@/api/workbooks";
import type {
  CommittedSheetContentChangeHandler,
  CommittedSheetMutationHandler,
  SheetContentChangeHandler,
} from "@/features/sync/sheetEditorChange";
import type { WorkbookStructureUpdate } from "@/features/sync/types";
import { normalizeSheetIndex } from "@/features/workspace/sheetIndex";
import type { WorkbookDocumentStore } from "@/features/workspace/WorkbookDocumentStore";
import { adaptFortuneSheetLayout, type SheetGridLayout } from "../layout/fortuneSheetLayout";
import { findSheetIndexById } from "../sheetIdentity";
import { AiSheetEditor } from "./aiSheetEditor";
import { useSheetActivation } from "./SheetActivationContext";
import { type ManualSheetChangeData, useManualSheetSync } from "./useManualSheetSync";
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
  const aiEditorRef = useRef<AiSheetEditor | null>(null);
  const {
    saveStatus,
    manualEditor,
    handleChange: handleManualChange,
    handleOp,
    synchronizeServerSnapshot,
    replaceManualBaselineFromServerSnapshot,
  } = useManualSheetSync({
    workspaceId,
    workbook,
    sheetData,
    sessionKey,
    currentSheetIndex,
    sheetLoaded,
    documentStore,
    onSheetContentChanged,
    onSheetRevisionChanged,
  });
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
  if (!aiEditorRef.current) {
    aiEditorRef.current = new AiSheetEditor({
      getWorkbook: () => documentStore.getSnapshot(),
      getWorkbookInstance: () => workbookRef.current,
      applyCommittedDocument: (change, revision) => {
        onCommittedSheetContentChanged?.(change, revision);
      },
      replaceManualBaselineFromServer: async (sheetId) => {
        if (workspaceId == null) throw new Error("The workspace is not ready");
        const serverSheet = await fetchSheet(workspaceId, sheetId);
        const snapshot = {
          celldata: serverSheet.uploadedData ?? [],
          config: serverSheet.config,
        };
        replaceManualBaselineFromServerSnapshot(sheetId, snapshot);
        synchronizeServerSnapshot(sheetId, snapshot);
      },
      replaceManualBaselineFromServerSnapshot,
      synchronizeSaveBaselineFromServerSnapshot: synchronizeServerSnapshot,
      updateCommittedRevision: (sheetId, revision) => {
        onSheetRevisionChanged?.(sheetId, revision);
      },
    });
  }

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
    (data: ManualSheetChangeData) => {
      const results = handleManualChange(data);
      if (results.length === 0) return;

      const loadedSheetIds = new Set(
        (documentStore.getSnapshot()?.sheets ?? [])
          .filter((item) => item.loaded !== false)
          .map((item) => item.id),
      );
      const loadedData = data.filter((fortuneSheet) => {
        const id = Number(fortuneSheet.id);
        return Number.isInteger(id) && loadedSheetIds.has(id);
      });
      const layoutChanged = results.some(
        ({ change }) =>
          change?.kind === "snapshot" ||
          (change?.kind === "patch" && change.changeSet.configChanges.length > 0),
      );
      if (!layoutChanged) return;

      setLayoutState((current) => {
        const bySheetId =
          current.sessionKey === layoutSessionKey
            ? { ...current.bySheetId }
            : { ...initialLayouts };
        let changed = current.sessionKey !== layoutSessionKey;
        for (const fortuneSheet of loadedData) {
          const key = String(fortuneSheet.id);
          const nextLayout = adaptFortuneSheetLayout(fortuneSheet);
          if (JSON.stringify(bySheetId[key]) !== JSON.stringify(nextLayout)) {
            bySheetId[key] = nextLayout;
            changed = true;
          }
        }
        return changed ? { sessionKey: layoutSessionKey, bySheetId } : current;
      });
    },
    [documentStore, handleManualChange, initialLayouts, layoutSessionKey],
  );

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

  const handleActivateSheet = useCallback(
    (sheetId: string | number) => {
      const currentWorkbook = documentStore.getSnapshot();
      if (!currentWorkbook) return;
      const nextIndex = findSheetIndexById(currentWorkbook.sheets, sheetId);
      if (nextIndex >= 0) {
        onSheetIndexChange?.(nextIndex);
      }
    },
    [documentStore, onSheetIndexChange],
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
