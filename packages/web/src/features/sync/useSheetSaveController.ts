import type { FortuneCell } from "@openexcel/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSheet, SheetRevisionConflictError } from "@/api/workbooks";
import type { FortuneSheetData } from "@/features/workbook/editor/fortuneSheet";
import type { SheetSnapshotForSave } from "./sheetChunkSnapshot";
import { rebaseSheetAfterConflict } from "./sheetConflictRebase";
import type { SheetEditorChange } from "./sheetEditorChange";
import {
  SheetSaveCoordinator,
  type SheetSaveErrorAction,
  type SheetSaveIdentity,
  type SheetSaveRequest,
  type SheetSaveResult,
} from "./sheetSaveCoordinator";
import { createSheetSaveTask } from "./sheetSaveTask";

type SheetState = {
  revision: number;
  celldata: FortuneCell[];
  config: FortuneSheetData["config"];
};

type Props = {
  workspaceId: number | null;
  sheetLoaded: boolean;
  getDocumentVersion?: (sheetId: number) => number;
  getSheetState: (sheetId: number) => SheetState | null;
  onRevisionChanged?: (sheetId: number, revision: number, persistedThroughVersion?: number) => void;
  onServerSnapshot?: (sheetId: number, snapshot: SheetSnapshotForSave) => void;
  onRebasedChange?: (change: SheetEditorChange) => void;
};

export function useSheetSaveController({
  workspaceId,
  sheetLoaded,
  getDocumentVersion,
  getSheetState,
  onRevisionChanged,
  onServerSnapshot,
  onRebasedChange,
}: Props) {
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveStatusResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coordinatorRef = useRef<SheetSaveCoordinator | null>(null);
  const getSheetStateRef = useRef(getSheetState);
  getSheetStateRef.current = getSheetState;
  const generationBySheetRef = useRef<Map<number, number>>(new Map());

  const ensureCoordinator = useCallback(() => {
    if (!coordinatorRef.current) {
      coordinatorRef.current = new SheetSaveCoordinator({
        getSheetState: (sheetId) => getSheetStateRef.current(sheetId),
      });
    }
    return coordinatorRef.current;
  }, []);

  useEffect(() => {
    ensureCoordinator();
    return () => {
      coordinatorRef.current?.dispose();
      coordinatorRef.current = null;
      if (saveStatusResetRef.current) clearTimeout(saveStatusResetRef.current);
    };
  }, [ensureCoordinator]);

  const syncSheetToServer = useCallback(
    async (sheetId: number, generation: number, request: SheetSaveRequest) => {
      return createSheetSaveTask({
        workspaceId,
        sheetId,
        generation,
        isCurrent: () => generationBySheetRef.current.get(sheetId) === generation,
        setSaving: () => setSaveStatus("saving"),
        setIdle: () => setSaveStatus("idle"),
      })(request);
    },
    [workspaceId],
  );

  const synchronizeSheet = useCallback(
    (sheetId: number, identity: SheetSaveIdentity, snapshot: SheetSnapshotForSave) => {
      if (ensureCoordinator().synchronizeSheet(sheetId, identity, snapshot)) {
        generationBySheetRef.current.set(
          sheetId,
          (generationBySheetRef.current.get(sheetId) ?? 0) + 1,
        );
      }
    },
    [ensureCoordinator],
  );

  const synchronizeServerSnapshot = useCallback(
    (sheetId: number, snapshot: SheetSnapshotForSave) => {
      ensureCoordinator().acknowledgeRemoteSnapshot(sheetId, snapshot);
    },
    [ensureCoordinator],
  );

  const schedule = useCallback(
    (change: SheetEditorChange, documentVersion?: number) => {
      if (!sheetLoaded) return;

      const coordinator = ensureCoordinator();
      const generation = generationBySheetRef.current.get(change.sheetId) ?? 0;
      const isCurrentGeneration = () =>
        generationBySheetRef.current.get(change.sheetId) === generation;
      const scheduledDocumentVersion = documentVersion ?? getDocumentVersion?.(change.sheetId);

      const onSuccess = (result: SheetSaveResult, persistedThroughVersion?: number) => {
        setSaveStatus("saved");
        onRevisionChanged?.(change.sheetId, result.revision, persistedThroughVersion);
        if (result.snapshot) onServerSnapshot?.(change.sheetId, result.snapshot);
        if (saveStatusResetRef.current) clearTimeout(saveStatusResetRef.current);
        saveStatusResetRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
      };

      let onError: (error: unknown) => SheetSaveErrorAction;
      onError = (error) => {
        if (!isCurrentGeneration()) return "handled";
        if (!(error instanceof SheetRevisionConflictError) || workspaceId == null) {
          setSaveStatus("idle");
          return "retry";
        }

        void rebaseSheetAfterConflict({
          sheetId: change.sheetId,
          loadRemote: (sheetId) => fetchSheet(workspaceId, sheetId),
          rebase: (sheetId, remote) => coordinator.rebase(sheetId, remote),
        })
          .then((rebasedChange) => {
            if (!isCurrentGeneration()) return;
            if (!rebasedChange) {
              setSaveStatus("idle");
              return;
            }

            onRebasedChange?.(rebasedChange);
            coordinator.schedule(
              change.sheetId,
              {
                kind: "snapshot",
                snapshot: rebasedChange.snapshot,
                documentVersion: getDocumentVersion?.(change.sheetId),
              },
              (request) => syncSheetToServer(change.sheetId, generation, request),
              { conflictRetry: true, onSuccess, onError },
            );
          })
          .catch(() => {
            if (!isCurrentGeneration()) return;
            setSaveStatus("idle");
            coordinator.retry(
              change.sheetId,
              (request) => syncSheetToServer(change.sheetId, generation, request),
              { onSuccess, onError },
            );
          });
        return "handled";
      };

      coordinator.schedule(
        change.sheetId,
        change.kind === "patch"
          ? {
              kind: "patch",
              changeSet: change.changeSet,
              documentVersion: scheduledDocumentVersion,
            }
          : {
              kind: "snapshot",
              snapshot: change.snapshot,
              documentVersion: scheduledDocumentVersion,
            },
        (request) => syncSheetToServer(change.sheetId, generation, request),
        { onSuccess, onError },
      );
    },
    [
      getDocumentVersion,
      ensureCoordinator,
      onRebasedChange,
      onRevisionChanged,
      onServerSnapshot,
      sheetLoaded,
      syncSheetToServer,
      workspaceId,
    ],
  );

  return { saveStatus, schedule, synchronizeServerSnapshot, synchronizeSheet };
}
