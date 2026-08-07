import type { FortuneCell, SheetConfig } from "@openexcel/core";
import { hasSheetChanges, type SheetChangeSet } from "./sheetChangeSet";
import { applySheetChangeSetToSnapshot } from "./sheetChangeSetApplier";
import { createSheetChangeSet } from "./sheetChangeSetDiff";
import {
  changedSheetChunks,
  type SheetChunkReplacement,
  type SheetSnapshotForSave,
  serializeSheetChunkSnapshot,
  serializeSheetConfig,
} from "./sheetChunkSnapshot";

export type SheetSaveResult = { revision: number; snapshot?: SheetSnapshotForSave };
export type SheetSaveErrorAction = "handled" | "retry" | "stop";
export type SheetSaveInput =
  | {
      kind: "patch";
      changeSet: SheetChangeSet;
      documentVersion?: number;
    }
  | {
      kind: "snapshot";
      snapshot: SheetSnapshotForSave;
      documentVersion?: number;
    };
export type SheetSaveRequest =
  | {
      kind: "changeSet";
      baseRevision: number;
      changeSet: SheetChangeSet;
    }
  | {
      kind: "replaceChunks";
      baseRevision: number;
      config: SheetConfig | null;
      chunks: SheetChunkReplacement[];
    };
export type SheetSaveTask = (request: SheetSaveRequest) => Promise<SheetSaveResult>;

type SheetSnapshot = {
  revision: number;
  celldata: FortuneCell[];
  config: SheetConfig | null;
};

type SheetState = {
  workbookId: number;
  lifecycleKey: string;
  latestVersion: number;
  persistedSnapshot: SheetSnapshotForSave;
  desiredSnapshot: SheetSnapshotForSave;
  requiresChunkReplacement: boolean;
  documentVersionByVersion: Map<number, number | undefined>;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: Promise<void> | null;
  retryAttempt: number;
  conflictAttempt: number;
  retryAfterInFlight: boolean;
};

type SheetSaveOptions = {
  debounceMs?: number;
  conflictRetry?: boolean;
  onSuccess?: (result: SheetSaveResult, persistedThroughVersion?: number) => void;
  onError?: (error: unknown) => SheetSaveErrorAction | undefined;
};

const MAX_RETRY_ATTEMPTS = 5;
const MAX_CONFLICT_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000] as const;

function cloneSnapshot(snapshot: SheetSnapshotForSave): SheetSnapshotForSave {
  return {
    celldata: snapshot.celldata.map((cell) => ({ ...cell, v: structuredClone(cell.v) })),
    config: snapshot.config ? structuredClone(snapshot.config) : null,
  };
}

function changeSetFromSnapshots(
  persistedSnapshot: SheetSnapshotForSave,
  desiredSnapshot: SheetSnapshotForSave,
): SheetChangeSet {
  return createSheetChangeSet(persistedSnapshot, desiredSnapshot);
}

export type SheetSaveCoordinatorOptions = {
  getSheetState: (sheetId: number) => SheetSnapshot | null;
};

export type SheetSaveIdentity = {
  workbookId: number;
  lifecycleKey: string;
};

/** Debounces and serializes browser Sheet saves without making the editor await HTTP. */
export class SheetSaveCoordinator {
  private readonly options: SheetSaveCoordinatorOptions;
  private readonly states = new Map<number, SheetState>();
  private activeWorkbookId: number | null = null;

  constructor(options: SheetSaveCoordinatorOptions) {
    this.options = options;
  }

  synchronizeSheet(
    sheetId: number,
    identity: SheetSaveIdentity,
    snapshot: SheetSnapshotForSave,
  ): boolean {
    if (this.activeWorkbookId !== identity.workbookId) {
      this.clearStates();
      this.activeWorkbookId = identity.workbookId;
    }

    const current = this.states.get(sheetId);
    if (
      current?.workbookId === identity.workbookId &&
      current.lifecycleKey === identity.lifecycleKey
    ) {
      return false;
    }

    this.cancel(sheetId);
    const persistedSnapshot = cloneSnapshot(snapshot);
    this.states.set(sheetId, {
      workbookId: identity.workbookId,
      lifecycleKey: identity.lifecycleKey,
      latestVersion: 0,
      persistedSnapshot,
      desiredSnapshot: cloneSnapshot(persistedSnapshot),
      requiresChunkReplacement: false,
      documentVersionByVersion: new Map(),
      timer: null,
      inFlight: null,
      retryAttempt: 0,
      conflictAttempt: 0,
      retryAfterInFlight: false,
    });
    return true;
  }

  /** Acknowledges an external server commit while preserving unsaved local fields. */
  acknowledgeRemoteSnapshot(sheetId: number, remote: SheetSnapshotForSave): void {
    const state = this.states.get(sheetId);
    if (!state) return;
    const localChanges = changeSetFromSnapshots(state.persistedSnapshot, state.desiredSnapshot);
    state.persistedSnapshot = cloneSnapshot(remote);
    state.desiredSnapshot = applySheetChangeSetToSnapshot(remote, localChanges);
  }

  schedule(
    sheetId: number,
    input: SheetSaveInput,
    task: SheetSaveTask,
    options?: SheetSaveOptions,
  ): void {
    const state = this.states.get(sheetId);
    if (!state) {
      throw new Error(`Cannot schedule Sheet ${sheetId} before it is synchronized`);
    }

    state.latestVersion += 1;
    state.documentVersionByVersion.set(state.latestVersion, input.documentVersion);
    if (input.kind === "patch") {
      state.desiredSnapshot = applySheetChangeSetToSnapshot(state.desiredSnapshot, input.changeSet);
    } else {
      state.desiredSnapshot = cloneSnapshot(input.snapshot);
      state.requiresChunkReplacement = true;
    }
    state.retryAttempt = 0;
    if (!options?.conflictRetry) state.conflictAttempt = 0;
    this.cancelTimer(state);
    if (!state.inFlight) this.armTimer(sheetId, state, task, options, options?.debounceMs ?? 500);
  }

  retry(sheetId: number, task: SheetSaveTask, options?: SheetSaveOptions): void {
    const state = this.states.get(sheetId);
    if (!state) return;
    if (state.inFlight) {
      state.retryAfterInFlight = true;
      return;
    }
    if (state.timer !== null || state.retryAttempt >= MAX_RETRY_ATTEMPTS) return;
    const delay = RETRY_DELAYS_MS[state.retryAttempt] ?? RETRY_DELAYS_MS.at(-1)!;
    state.retryAttempt += 1;
    this.armTimer(sheetId, state, task, options, delay);
  }

  rebase(sheetId: number, remote: SheetSnapshotForSave): SheetSnapshotForSave | null {
    const state = this.states.get(sheetId);
    if (!state || state.conflictAttempt >= MAX_CONFLICT_ATTEMPTS) return null;

    const localChanges = changeSetFromSnapshots(state.persistedSnapshot, state.desiredSnapshot);
    const rebased = applySheetChangeSetToSnapshot(remote, localChanges);
    state.persistedSnapshot = cloneSnapshot(remote);
    state.desiredSnapshot = rebased;
    state.retryAfterInFlight = false;
    state.latestVersion += 1;
    state.documentVersionByVersion.set(state.latestVersion, undefined);
    state.conflictAttempt += 1;
    return cloneSnapshot(rebased);
  }

  dispose(): void {
    this.clearStates();
    this.activeWorkbookId = null;
  }

  private async flush(
    sheetId: number,
    task: SheetSaveTask,
    options?: SheetSaveOptions,
  ): Promise<void> {
    const state = this.states.get(sheetId);
    if (!state || state.inFlight) return;

    const sheetState = this.options.getSheetState(sheetId);
    const baseRevision = sheetState?.revision ?? 0;
    const version = state.latestVersion;
    const desiredSnapshot = cloneSnapshot(state.desiredSnapshot);
    const changeSet = changeSetFromSnapshots(state.persistedSnapshot, desiredSnapshot);
    const persistedThroughVersion = [...state.documentVersionByVersion.entries()]
      .filter(([savedVersion]) => savedVersion <= version)
      .map(([, documentVersion]) => documentVersion ?? 0)
      .reduce((maximum, documentVersion) => Math.max(maximum, documentVersion), 0);

    let request: SheetSaveRequest;
    if (state.requiresChunkReplacement) {
      const persistedChunks = serializeSheetChunkSnapshot(state.persistedSnapshot.celldata);
      const desiredChunks = serializeSheetChunkSnapshot(desiredSnapshot.celldata);
      const chunks = changedSheetChunks(persistedChunks, desiredChunks);
      const configChanged =
        serializeSheetConfig(desiredSnapshot.config) !==
        serializeSheetConfig(state.persistedSnapshot.config);
      if (chunks.length === 0 && !configChanged) return;
      request = {
        kind: "replaceChunks",
        baseRevision,
        config: desiredSnapshot.config,
        chunks,
      };
    } else {
      if (!hasSheetChanges(changeSet)) return;
      request = { kind: "changeSet", baseRevision, changeSet };
    }

    let retryRequested = false;
    const inFlight = task(request)
      .then((result) => {
        const current = this.states.get(sheetId);
        if (current !== state) return;

        state.persistedSnapshot = cloneSnapshot(result.snapshot ?? desiredSnapshot);
        if (state.latestVersion === version) state.requiresChunkReplacement = false;
        state.retryAttempt = 0;
        state.conflictAttempt = 0;
        state.retryAfterInFlight = false;
        for (const savedVersion of state.documentVersionByVersion.keys()) {
          if (savedVersion <= version) state.documentVersionByVersion.delete(savedVersion);
        }
        options?.onSuccess?.(
          result,
          persistedThroughVersion > 0 ? persistedThroughVersion : undefined,
        );
        if (current.latestVersion !== version) {
          this.armTimer(sheetId, current, task, options, options?.debounceMs ?? 500);
        }
      })
      .catch((error) => {
        let action: SheetSaveErrorAction | undefined;
        try {
          action = options?.onError?.(error);
        } catch (callbackError) {
          console.error("Sheet save error callback failed", callbackError);
          action = "retry";
        }
        if (action !== "handled" && action !== "stop") retryRequested = true;
      })
      .finally(() => {
        const current = this.states.get(sheetId);
        if (current === state && current.inFlight === inFlight) {
          current.inFlight = null;
          if (retryRequested || current.retryAfterInFlight) {
            current.retryAfterInFlight = false;
            this.retry(sheetId, task, options);
          }
        }
      });
    state.inFlight = inFlight;
  }

  private cancelTimer(state: SheetState): void {
    if (state.timer !== null) {
      clearTimeout(state.timer);
      state.timer = null;
    }
  }

  private armTimer(
    sheetId: number,
    state: SheetState,
    task: SheetSaveTask,
    options: SheetSaveOptions | undefined,
    delayMs: number,
  ): void {
    this.cancelTimer(state);
    state.timer = setTimeout(() => {
      state.timer = null;
      void this.flush(sheetId, task, options);
    }, delayMs);
  }

  private cancel(sheetId: number): void {
    const state = this.states.get(sheetId);
    if (state) this.cancelTimer(state);
  }

  private clearStates(): void {
    for (const state of this.states.values()) this.cancelTimer(state);
    this.states.clear();
  }
}
