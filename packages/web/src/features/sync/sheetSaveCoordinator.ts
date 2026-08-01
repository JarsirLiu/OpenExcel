import type { FortuneCell, SheetChangeDelta, SheetConfig } from "@openexcel/core";
import {
  changedSheetChunks,
  SHEET_CHUNK_COLUMNS,
  SHEET_CHUNK_ROWS,
  type SheetChunkReplacement,
  type SheetSnapshotForSave,
  serializeSheetChunkSnapshot,
  serializeSheetConfig,
} from "./sheetChunkSnapshot";

export type SheetSaveResult = { revision: number };
export type SheetSaveRequest =
  | {
      kind: "mutation";
      baseRevision: number;
      mutation: SheetChangeDelta;
    }
  | {
      kind: "replaceChunks";
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
  pendingCells: Map<string, PendingCell>;
  pendingConfig: { config: SheetConfig | null; version: number } | null;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: Promise<void> | null;
};

type PendingCell = {
  row: number;
  col: number;
  cell: Record<string, unknown> | null;
  version: number;
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
      pendingCells: new Map(),
      pendingConfig: null,
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
      mutation?: SheetChangeDelta;
      onSuccess?: (result: SheetSaveResult) => void;
      onError?: (error: unknown) => void;
    },
  ): void {
    const state = this.states.get(sheetId);
    if (!state) return;
    state.latestVersion += 1;
    state.latestSnapshot = snapshot;
    if (options?.mutation) {
      for (const cell of options.mutation.type === "patch" ? options.mutation.cells : []) {
        state.pendingCells.set(`${cell.row},${cell.col}`, {
          row: cell.row,
          col: cell.col,
          cell: cell.cell,
          version: state.latestVersion,
        });
      }
      if (options.mutation.type === "patch" && options.mutation.config !== undefined) {
        state.pendingConfig = { config: snapshot.config, version: state.latestVersion };
      }
    } else {
      state.pendingCells.clear();
      state.pendingConfig = null;
    }
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
    state.latestSnapshot = merged;
    state.pendingCells.clear();
    state.pendingConfig = null;
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
      mutation?: SheetChangeDelta;
      onSuccess?: (result: SheetSaveResult) => void;
      onError?: (error: unknown) => void;
    },
  ): Promise<void> {
    const state = this.states.get(sheetId);
    if (!state || state.inFlight) return;

    const version = state.latestVersion;
    const sentCells = new Map(state.pendingCells);
    const sentConfig = state.pendingConfig;
    const sentConfigValue = sentConfig ? state.latestSnapshot.config : null;
    let request: SheetSaveRequest;
    let snapshot: SheetSnapshotForSave | null = null;

    if (sentCells.size > 0 || sentConfig) {
      const cells = [...sentCells.values()].map(({ row, col, cell }) => ({ row, col, cell }));
      request = {
        kind: "mutation",
        baseRevision: state.persistedRevision,
        mutation: {
          type: "patch",
          cells,
          ...(sentConfig ? { config: sentConfigValue as Record<string, unknown> | null } : {}),
        },
      };
    } else {
      snapshot = cloneSnapshot(state.latestSnapshot);
      const chunks = changedSheetChunks(
        state.persistedChunks,
        serializeSheetChunkSnapshot(snapshot.celldata),
      );
      const configChanged = serializeSheetConfig(snapshot.config) !== state.persistedConfig;
      if (chunks.length === 0 && !configChanged) return;
      request = {
        kind: "replaceChunks",
        baseRevision: state.persistedRevision,
        config: snapshot.config,
        chunks,
      };
    }

    const inFlight = task(request)
      .then((result) => {
        const current = this.states.get(sheetId);
        if (current !== state) return;
        if (request.kind === "mutation") {
          for (const [key, sent] of sentCells) {
            const pending = current.pendingCells.get(key);
            if (pending?.version !== sent.version) continue;
            current.pendingCells.delete(key);
          }
          if (sentConfig && current.pendingConfig?.version === sentConfig.version) {
            current.pendingConfig = null;
          }
        } else {
          current.persistedChunks = serializeSheetChunkSnapshot(snapshot?.celldata ?? []);
          current.persistedConfig = serializeSheetConfig(snapshot?.config ?? null);
        }
        if (request.kind === "mutation") {
          current.persistedConfig = sentConfig
            ? serializeSheetConfig(sentConfigValue)
            : current.persistedConfig;
          const sentCellsByChunk = new Map<string, PendingCell[]>();
          for (const sent of sentCells.values()) {
            const key = `${Math.floor((sent.row - 1) / SHEET_CHUNK_ROWS)},${Math.floor(
              (sent.col - 1) / SHEET_CHUNK_COLUMNS,
            )}`;
            const chunkCells = sentCellsByChunk.get(key);
            if (chunkCells) chunkCells.push(sent);
            else sentCellsByChunk.set(key, [sent]);
          }
          for (const [key, chunkCells] of sentCellsByChunk) {
            const payload = current.persistedChunks.get(key);
            const cells = payload
              ? ((JSON.parse(payload) as { celldata?: FortuneCell[] }).celldata ?? [])
              : [];
            const cellMap = new Map(cells.map((cell) => [`${cell.r},${cell.c}`, cell]));
            for (const sent of chunkCells) {
              const cellKey = `${sent.row - 1},${sent.col - 1}`;
              if (sent.cell === null) {
                cellMap.delete(cellKey);
              } else {
                cellMap.set(cellKey, {
                  r: sent.row - 1,
                  c: sent.col - 1,
                  v: sent.cell as unknown as FortuneCell["v"],
                });
              }
            }
            const nextCells = [...cellMap.values()].sort(
              (left, right) => left.r - right.r || left.c - right.c,
            );
            current.persistedChunks.set(key, JSON.stringify({ celldata: nextCells }));
            if (nextCells.length === 0) current.persistedChunks.delete(key);
          }
        }
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
