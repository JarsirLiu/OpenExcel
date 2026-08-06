import type { FortuneCell, SheetCommand } from "@openexcel/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { executeSheetCommand, fetchSheet, SheetRevisionConflictError } from "@/api/workbooks";
import type { FortuneSheetData } from "@/features/workbook/editor/fortuneSheet";
import type { SheetSnapshotForSave } from "./sheetChunkSnapshot";
import type { SheetEditorChange } from "./sheetEditorChange";
import {
  SheetSaveCoordinator,
  type SheetSaveErrorAction,
  type SheetSaveRequest,
  type SheetSaveResult,
} from "./sheetSaveCoordinator";

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

function createMutationId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `web-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

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
  const generationBySheetRef = useRef<Map<number, number>>(new Map());
  if (!coordinatorRef.current) {
    coordinatorRef.current = new SheetSaveCoordinator({
      getSheetState,
    });
  }

  useEffect(() => {
    return () => {
      coordinatorRef.current?.dispose();
      if (saveStatusResetRef.current) clearTimeout(saveStatusResetRef.current);
    };
  }, []);

  const syncSheetToServer = useCallback(
    async (sheetId: number, generation: number, request: SheetSaveRequest) => {
      if (workspaceId == null) return { revision: request.baseRevision };
      if (generationBySheetRef.current.get(sheetId) !== generation) {
        return { revision: request.baseRevision };
      }

      const command: SheetCommand =
        request.kind === "mutation"
          ? {
              kind: "mutation",
              mutationId: createMutationId(),
              sheetId,
              baseRevision: request.baseRevision,
              mutation: request.mutation,
            }
          : {
              kind: "replaceChunks",
              mutationId: createMutationId(),
              sheetId,
              baseRevision: request.baseRevision,
              config: request.config as Record<string, unknown> | null,
              chunks: request.chunks,
            };

      setSaveStatus("saving");
      try {
        const result = await executeSheetCommand(workspaceId, command);
        if (generationBySheetRef.current.get(sheetId) !== generation) {
          return { revision: request.baseRevision };
        }
        const serverSheet = await fetchSheet(workspaceId, sheetId);
        if (generationBySheetRef.current.get(sheetId) !== generation) {
          return { revision: request.baseRevision };
        }
        return {
          ...result,
          snapshot: {
            celldata: (serverSheet.uploadedData ?? []) as FortuneCell[],
            config: serverSheet.config,
          },
        };
      } catch (error) {
        setSaveStatus("idle");
        throw error;
      }
    },
    [workspaceId],
  );

  const reset = useCallback((sheetId: number, snapshot: SheetSnapshotForSave) => {
    generationBySheetRef.current.set(sheetId, (generationBySheetRef.current.get(sheetId) ?? 0) + 1);
    coordinatorRef.current?.reset(sheetId, snapshot);
  }, []);

  const schedule = useCallback(
    (change: SheetEditorChange, documentVersion?: number) => {
      if (!sheetLoaded) return;

      const coordinator = coordinatorRef.current;
      if (!coordinator) return;
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

        void fetchSheet(workspaceId, change.sheetId)
          .then((remote) => {
            if (!isCurrentGeneration()) return;
            const rebased = coordinator.rebase(change.sheetId, {
              celldata: (remote.uploadedData ?? []) as FortuneCell[],
              config: remote.config,
            });
            if (!rebased) {
              setSaveStatus("idle");
              return;
            }

            const rebasedChange: SheetEditorChange = {
              kind: "snapshot",
              sheetId: change.sheetId,
              snapshot: rebased,
            };
            onRebasedChange?.(rebasedChange);
            coordinator.schedule(
              change.sheetId,
              {
                kind: "snapshot",
                snapshot: rebased,
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
              mutation: change.mutation,
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
      onRebasedChange,
      onRevisionChanged,
      onServerSnapshot,
      sheetLoaded,
      syncSheetToServer,
      workspaceId,
    ],
  );

  return { saveStatus, reset, schedule };
}
