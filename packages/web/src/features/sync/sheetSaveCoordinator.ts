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
export type SheetSaveErrorAction = "handled" | "retry" | "stop";
export type SheetSaveInput =
  | {
      kind: "patch";
      mutation: Extract<SheetChangeDelta, { type: "patch" }>;
    }
  | {
      kind: "snapshot";
      snapshot: SheetSnapshotForSave;
    };
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
  latestCells: Map<string, FortuneCell>;
  latestConfig: SheetConfig | null;
  persistedRevision: number;
  persistedChunks: Map<string, string>;
  persistedConfig: string;
  pendingCells: Map<string, PendingCell>;
  pendingConfig: { config: SheetConfig | null; version: number } | null;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: Promise<void> | null;
  retryAttempt: number;
  conflictAttempt: number;
  retryAfterInFlight: boolean;
};

type PendingCell = {
  row: number;
  col: number;
  cell: Record<string, unknown> | null;
  version: number;
};

type SheetSaveOptions = {
  debounceMs?: number;
  conflictRetry?: boolean;
  onSuccess?: (result: SheetSaveResult) => void;
  onError?: (error: unknown) => SheetSaveErrorAction | undefined;
};

const MAX_RETRY_ATTEMPTS = 5;
const MAX_CONFLICT_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000] as const;

function cloneSnapshot(snapshot: SheetSnapshotForSave): SheetSnapshotForSave {
  return {
    celldata: snapshot.celldata.map((cell) => ({ ...cell, v: { ...cell.v } })),
    config: snapshot.config ? structuredClone(snapshot.config) : null,
  };
}

function cellsFromCelldata(celldata: readonly FortuneCell[]): Map<string, FortuneCell> {
  return new Map(celldata.map((cell) => [`${cell.r},${cell.c}`, { ...cell, v: { ...cell.v } }]));
}

function snapshotFromCells(
  cells: ReadonlyMap<string, FortuneCell>,
  config: SheetConfig | null,
): SheetSnapshotForSave {
  return {
    celldata: [...cells.values()]
      .map((cell) => ({ ...cell, v: { ...cell.v } }))
      .sort((left, right) => left.r - right.r || left.c - right.c),
    config: config ? structuredClone(config) : null,
  };
}

function sameCell(left: FortuneCell | undefined, right: FortuneCell | undefined): boolean {
  return JSON.stringify(left?.v ?? null) === JSON.stringify(right?.v ?? null);
}

function cellsFromChunks(chunks: ReadonlyMap<string, string>): Map<string, FortuneCell> {
  const cells = new Map<string, FortuneCell>();
  for (const payload of chunks.values()) {
    const parsed = JSON.parse(payload) as { celldata?: FortuneCell[] };
    for (const cell of parsed.celldata ?? []) cells.set(`${cell.r},${cell.c}`, cell);
  }
  return cells;
}

/** Debounces and serializes browser Sheet saves without making the editor await HTTP. */
export class SheetSaveCoordinator {
  private readonly states = new Map<number, SheetState>();

  reset(sheetId: number, snapshot: SheetSnapshotForSave, revision: number): void {
    this.cancel(sheetId);
    this.states.set(sheetId, {
      latestVersion: 0,
      latestCells: cellsFromCelldata(snapshot.celldata),
      latestConfig: snapshot.config ? structuredClone(snapshot.config) : null,
      persistedRevision: revision,
      persistedChunks: serializeSheetChunkSnapshot(snapshot.celldata),
      persistedConfig: serializeSheetConfig(snapshot.config),
      pendingCells: new Map(),
      pendingConfig: null,
      timer: null,
      inFlight: null,
      retryAttempt: 0,
      conflictAttempt: 0,
      retryAfterInFlight: false,
    });
  }

  schedule(
    sheetId: number,
    input: SheetSaveInput,
    task: SheetSaveTask,
    options?: SheetSaveOptions,
  ): void {
    const state = this.states.get(sheetId);
    if (!state) return;
    state.latestVersion += 1;
    state.retryAttempt = 0;
    if (!options?.conflictRetry) state.conflictAttempt = 0;
    if (input.kind === "patch") {
      for (const cell of input.mutation.cells) {
        const key = `${cell.row - 1},${cell.col - 1}`;
        if (cell.cell === null) {
          state.latestCells.delete(key);
        } else {
          state.latestCells.set(key, {
            r: cell.row - 1,
            c: cell.col - 1,
            v: { ...(cell.cell as unknown as FortuneCell["v"]) },
          });
        }
      }
      if (input.mutation.config !== undefined) {
        state.latestConfig = input.mutation.config as SheetConfig | null;
      }
      for (const cell of input.mutation.cells) {
        state.pendingCells.set(`${cell.row},${cell.col}`, {
          row: cell.row,
          col: cell.col,
          cell: cell.cell,
          version: state.latestVersion,
        });
      }
      if (input.mutation.config !== undefined) {
        state.pendingConfig = { config: state.latestConfig, version: state.latestVersion };
      }
    } else {
      state.latestCells = cellsFromCelldata(input.snapshot.celldata);
      state.latestConfig = input.snapshot.config ? structuredClone(input.snapshot.config) : null;
      state.pendingCells.clear();
      state.pendingConfig = null;
    }
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
    if (state.timer !== null) return;
    if (state.retryAttempt >= MAX_RETRY_ATTEMPTS) return;
    const delay = RETRY_DELAYS_MS[state.retryAttempt] ?? RETRY_DELAYS_MS.at(-1)!;
    state.retryAttempt += 1;
    this.armTimer(sheetId, state, task, options, delay);
  }

  rebase(
    sheetId: number,
    remote: SheetSnapshotForSave,
    revision: number,
  ): SheetSnapshotForSave | null {
    const state = this.states.get(sheetId);
    if (!state) return null;
    if (state.conflictAttempt >= MAX_CONFLICT_ATTEMPTS) return null;

    const baseCells = cellsFromChunks(state.persistedChunks);
    const localCells = state.latestCells;
    const remoteCells = new Map(remote.celldata.map((cell) => [`${cell.r},${cell.c}`, cell]));
    const keys = new Set([...baseCells.keys(), ...localCells.keys()]);
    for (const key of keys) {
      const baseCell = baseCells.get(key);
      const localCell = localCells.get(key);
      if (sameCell(baseCell, localCell)) continue;
      if (localCell) remoteCells.set(key, localCell);
      else remoteCells.delete(key);
    }

    const localConfigChanged = serializeSheetConfig(state.latestConfig) !== state.persistedConfig;
    const merged = {
      celldata: [...remoteCells.values()].sort(
        (left, right) => left.r - right.r || left.c - right.c,
      ),
      config: localConfigChanged ? state.latestConfig : remote.config,
    };
    state.persistedRevision = revision;
    state.persistedChunks = serializeSheetChunkSnapshot(remote.celldata);
    state.persistedConfig = serializeSheetConfig(remote.config);
    state.latestCells = cellsFromCelldata(merged.celldata);
    state.latestConfig = merged.config;
    state.pendingCells.clear();
    state.pendingConfig = null;
    state.retryAfterInFlight = false;
    state.latestVersion += 1;
    state.conflictAttempt += 1;
    return cloneSnapshot(merged);
  }

  dispose(): void {
    for (const state of this.states.values()) this.cancelTimer(state);
    this.states.clear();
  }

  private async flush(
    sheetId: number,
    task: SheetSaveTask,
    options?: SheetSaveOptions,
  ): Promise<void> {
    const state = this.states.get(sheetId);
    if (!state || state.inFlight) return;

    const version = state.latestVersion;
    const sentCells = new Map(state.pendingCells);
    const sentConfig = state.pendingConfig;
    const sentConfigValue = sentConfig ? state.latestConfig : null;
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
      snapshot = snapshotFromCells(state.latestCells, state.latestConfig);
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

    let retryRequested = false;
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
        current.retryAttempt = 0;
        current.conflictAttempt = 0;
        current.retryAfterInFlight = false;
        options?.onSuccess?.(result);
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
        if (action !== "handled" && action !== "stop") {
          retryRequested = true;
        }
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
}
