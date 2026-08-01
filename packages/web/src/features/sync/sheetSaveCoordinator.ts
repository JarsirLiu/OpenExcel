import type { FortuneCell, SheetConfig } from "@openexcel/core";
import {
  changedSheetChunks,
  type SheetChunkReplacement,
  type SheetSnapshotForSave,
  serializeSheetChunkSnapshot,
  serializeSheetConfig,
} from "./sheetChunkSnapshot";

export type SheetSaveResult = { revision: number };
export type SheetSaveRequest = {
  baseRevision: number;
  config: SheetConfig | null;
  chunks: SheetChunkReplacement[];
};
export type SheetSaveTask = (request: SheetSaveRequest) => Promise<SheetSaveResult>;

type SheetState = {
  latestVersion: number;
  latestSnapshot: SheetSnapshotForSave;
  persistedRevision: number;
  persistedChunks: Map<string, string>;
  persistedConfig: string;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: Promise<void> | null;
};

function cloneSnapshot(snapshot: SheetSnapshotForSave): SheetSnapshotForSave {
  return {
    celldata: snapshot.celldata.map((cell) => ({ ...cell, v: { ...cell.v } })),
    config: snapshot.config ? structuredClone(snapshot.config) : null,
  };
}

/** Debounces and serializes browser Sheet saves without making the editor await HTTP. */
export class SheetSaveCoordinator {
  private readonly states = new Map<number, SheetState>();

  reset(sheetId: number, snapshot: SheetSnapshotForSave, revision: number): void {
    this.cancel(sheetId);
    this.states.set(sheetId, {
      latestVersion: 0,
      latestSnapshot: cloneSnapshot(snapshot),
      persistedRevision: revision,
      persistedChunks: serializeSheetChunkSnapshot(snapshot.celldata),
      persistedConfig: serializeSheetConfig(snapshot.config),
      timer: null,
      inFlight: null,
    });
  }

  schedule(
    sheetId: number,
    snapshot: SheetSnapshotForSave,
    task: SheetSaveTask,
    options?: {
      debounceMs?: number;
      onSuccess?: (result: SheetSaveResult) => void;
      onError?: (error: unknown) => void;
    },
  ): void {
    const state = this.states.get(sheetId);
    if (!state) return;
    state.latestVersion += 1;
    state.latestSnapshot = cloneSnapshot(snapshot);
    this.cancelTimer(state);
    state.timer = setTimeout(() => {
      state.timer = null;
      void this.flush(sheetId, task, options);
    }, options?.debounceMs ?? 500);
  }

  setRevision(sheetId: number, revision: number): void {
    const state = this.states.get(sheetId);
    if (state && revision > state.persistedRevision) state.persistedRevision = revision;
  }

  rebase(
    sheetId: number,
    remote: SheetSnapshotForSave,
    revision: number,
  ): SheetSnapshotForSave | null {
    const state = this.states.get(sheetId);
    if (!state) return null;
    const localChunks = serializeSheetChunkSnapshot(state.latestSnapshot.celldata);
    const localChanges = changedSheetChunks(state.persistedChunks, localChunks);
    const remoteCells = new Map(remote.celldata.map((cell) => [`${cell.r},${cell.c}`, cell]));
    for (const change of localChanges) {
      for (const [key, cell] of remoteCells) {
        const row = Math.floor(cell.r / 256);
        const col = Math.floor(cell.c / 256);
        if (row === change.chunkRow && col === change.chunkCol) remoteCells.delete(key);
      }
      if (change.payload) {
        const parsed = JSON.parse(change.payload) as { celldata?: FortuneCell[] };
        for (const cell of parsed.celldata ?? []) remoteCells.set(`${cell.r},${cell.c}`, cell);
      }
    }
    const localConfigChanged =
      serializeSheetConfig(state.latestSnapshot.config) !== state.persistedConfig;
    const merged = {
      celldata: [...remoteCells.values()].sort(
        (left, right) => left.r - right.r || left.c - right.c,
      ),
      config: localConfigChanged ? state.latestSnapshot.config : remote.config,
    };
    state.persistedRevision = revision;
    state.persistedChunks = serializeSheetChunkSnapshot(remote.celldata);
    state.persistedConfig = serializeSheetConfig(remote.config);
    state.latestSnapshot = cloneSnapshot(merged);
    state.latestVersion += 1;
    return cloneSnapshot(merged);
  }

  dispose(): void {
    for (const state of this.states.values()) this.cancelTimer(state);
    this.states.clear();
  }

  private async flush(
    sheetId: number,
    task: SheetSaveTask,
    options?: {
      debounceMs?: number;
      onSuccess?: (result: SheetSaveResult) => void;
      onError?: (error: unknown) => void;
    },
  ): Promise<void> {
    const state = this.states.get(sheetId);
    if (!state || state.inFlight) return;

    const version = state.latestVersion;
    const snapshot = cloneSnapshot(state.latestSnapshot);
    const chunks = changedSheetChunks(
      state.persistedChunks,
      serializeSheetChunkSnapshot(snapshot.celldata),
    );
    const configChanged = serializeSheetConfig(snapshot.config) !== state.persistedConfig;
    if (chunks.length === 0 && !configChanged) return;

    const request: SheetSaveRequest = {
      baseRevision: state.persistedRevision,
      config: snapshot.config,
      chunks,
    };
    const inFlight = task(request)
      .then((result) => {
        const current = this.states.get(sheetId);
        if (current !== state) return;
        const nextChunks = serializeSheetChunkSnapshot(snapshot.celldata);
        current.persistedChunks = nextChunks;
        current.persistedConfig = serializeSheetConfig(snapshot.config);
        current.persistedRevision = result.revision;
        options?.onSuccess?.(result);
        if (current.latestVersion !== version) {
          current.timer = setTimeout(() => {
            current.timer = null;
            void this.flush(sheetId, task, options);
          }, options?.debounceMs ?? 500);
        }
      })
      .catch((error) => {
        options?.onError?.(error);
      })
      .finally(() => {
        const current = this.states.get(sheetId);
        if (current === state && current.inFlight === inFlight) current.inFlight = null;
      });
    state.inFlight = inFlight;
  }

  private cancelTimer(state: SheetState): void {
    if (state.timer !== null) {
      clearTimeout(state.timer);
      state.timer = null;
    }
  }

  private cancel(sheetId: number): void {
    const state = this.states.get(sheetId);
    if (state) this.cancelTimer(state);
  }
}
