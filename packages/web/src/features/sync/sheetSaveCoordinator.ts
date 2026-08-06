import type { FortuneCell, SheetChangeDelta, SheetConfig } from "@openexcel/core";
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
      mutation: Extract<SheetChangeDelta, { type: "patch" }>;
      documentVersion?: number;
    }
  | {
      kind: "snapshot";
      snapshot: SheetSnapshotForSave;
      documentVersion?: number;
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

type SheetSnapshot = {
  revision: number;
  celldata: FortuneCell[];
  config: SheetConfig | null;
};

type SheetState = {
  latestVersion: number;
  desiredCells: Map<string, FortuneCell>;
  desiredConfig: SheetConfig | null;
  pendingCells: Map<string, PendingCell>;
  pendingConfig: {
    config: SheetConfig | null;
    version: number;
    documentVersion?: number;
  } | null;
  latestDocumentVersion?: number;
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
  removed?: readonly string[];
  version: number;
  documentVersion?: number;
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

export type SheetSaveCoordinatorOptions = {
  getSheetState: (sheetId: number) => SheetSnapshot | null;
};

/** Debounces and serializes browser Sheet saves without making the editor await HTTP. */
export class SheetSaveCoordinator {
  private readonly options: SheetSaveCoordinatorOptions;
  private readonly states = new Map<number, SheetState>();

  constructor(options: SheetSaveCoordinatorOptions) {
    this.options = options;
  }

  reset(sheetId: number, snapshot: SheetSnapshotForSave): void {
    this.cancel(sheetId);
    this.states.set(sheetId, {
      latestVersion: 0,
      desiredCells: cellsFromCelldata(snapshot.celldata),
      desiredConfig: snapshot.config ? structuredClone(snapshot.config) : null,
      pendingCells: new Map(),
      pendingConfig: null,
      latestDocumentVersion: 0,
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
    if (input.documentVersion !== undefined) {
      state.latestDocumentVersion = Math.max(
        state.latestDocumentVersion ?? 0,
        input.documentVersion,
      );
    }
    state.retryAttempt = 0;
    if (!options?.conflictRetry) state.conflictAttempt = 0;
    if (input.kind === "patch") {
      for (const cell of input.mutation.cells) {
        const key = `${cell.row - 1},${cell.col - 1}`;
        if (cell.cell === null) {
          state.desiredCells.delete(key);
        } else {
          const previous = state.desiredCells.get(key);
          const nextValue: Record<string, unknown> = {
            ...((previous?.v ?? {}) as unknown as Record<string, unknown>),
            ...cell.cell,
          };
          for (const field of cell.removed ?? []) delete nextValue[field];
          state.desiredCells.set(key, {
            r: cell.row - 1,
            c: cell.col - 1,
            v: nextValue as unknown as FortuneCell["v"],
          });
        }
      }
      if (input.mutation.config !== undefined) {
        state.desiredConfig = input.mutation.config as SheetConfig | null;
      }
      for (const cell of input.mutation.cells) {
        const key = `${cell.row},${cell.col}`;
        const previous = state.pendingCells.get(key);
        if (cell.cell === null) {
          state.pendingCells.set(key, {
            row: cell.row,
            col: cell.col,
            cell: null,
            version: state.latestVersion,
            documentVersion: input.documentVersion,
          });
          continue;
        }
        const removed = new Set([...(previous?.removed ?? []), ...(cell.removed ?? [])]);
        for (const field of Object.keys(cell.cell)) removed.delete(field);
        state.pendingCells.set(key, {
          row: cell.row,
          col: cell.col,
          cell: { ...(previous?.cell ?? {}), ...cell.cell },
          ...(removed.size > 0 ? { removed: [...removed] } : {}),
          version: state.latestVersion,
          documentVersion: input.documentVersion,
        });
      }
      if (input.mutation.config !== undefined) {
        state.pendingConfig = {
          config: state.desiredConfig,
          version: state.latestVersion,
          documentVersion: input.documentVersion,
        };
      }
    } else {
      state.desiredCells = cellsFromCelldata(input.snapshot.celldata);
      state.desiredConfig = input.snapshot.config ? structuredClone(input.snapshot.config) : null;
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

  rebase(sheetId: number, remote: SheetSnapshotForSave): SheetSnapshotForSave | null {
    const state = this.states.get(sheetId);
    if (!state) return null;
    if (state.conflictAttempt >= MAX_CONFLICT_ATTEMPTS) return null;

    const remoteCells = new Map(remote.celldata.map((cell) => [`${cell.r},${cell.c}`, cell]));
    for (const pending of state.pendingCells.values()) {
      const key = `${pending.row - 1},${pending.col - 1}`;
      if (pending.cell === null) {
        remoteCells.delete(key);
        continue;
      }
      const previous = remoteCells.get(key);
      const nextValue: Record<string, unknown> = {
        ...((previous?.v ?? {}) as unknown as Record<string, unknown>),
        ...pending.cell,
      };
      for (const field of pending.removed ?? []) delete nextValue[field];
      remoteCells.set(key, {
        r: pending.row - 1,
        c: pending.col - 1,
        v: nextValue as unknown as FortuneCell["v"],
      });
    }

    const merged = {
      celldata: [...remoteCells.values()].sort(
        (left, right) => left.r - right.r || left.c - right.c,
      ),
      config: state.pendingConfig?.config ?? remote.config,
    };
    state.desiredCells = cellsFromCelldata(merged.celldata);
    state.desiredConfig = merged.config;
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

    const sheetState = this.options.getSheetState(sheetId);
    const baseRevision = sheetState?.revision ?? 0;
    const persistedChunks = sheetState
      ? serializeSheetChunkSnapshot(sheetState.celldata)
      : new Map<string, string>();
    const persistedConfig = serializeSheetConfig(sheetState?.config ?? null);

    const version = state.latestVersion;
    const sentCells = new Map(state.pendingCells);
    const sentConfig = state.pendingConfig;
    const sentConfigValue = sentConfig?.config ?? null;
    let persistedThroughVersion = Math.max(
      ...[...sentCells.values(), sentConfig].map((pending) => pending?.documentVersion ?? 0),
    );
    let request: SheetSaveRequest;
    let snapshot: SheetSnapshotForSave | null = null;

    if (sentCells.size > 0 || sentConfig) {
      const cells = [...sentCells.values()].map(({ row, col, cell, removed }) => ({
        row,
        col,
        cell,
        ...(removed ? { removed: [...removed] } : {}),
      }));
      request = {
        kind: "mutation",
        baseRevision,
        mutation: {
          type: "patch",
          cells,
          ...(sentConfig ? { config: sentConfigValue as Record<string, unknown> | null } : {}),
        },
      };
    } else {
      snapshot = snapshotFromCells(state.desiredCells, state.desiredConfig);
      const chunks = changedSheetChunks(
        persistedChunks,
        serializeSheetChunkSnapshot(snapshot.celldata),
      );
      const configChanged = serializeSheetConfig(snapshot.config) !== persistedConfig;
      if (chunks.length === 0 && !configChanged) return;
      request = {
        kind: "replaceChunks",
        baseRevision,
        config: snapshot.config,
        chunks,
      };
      persistedThroughVersion = state.latestDocumentVersion ?? 0;
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
        }
        current.retryAttempt = 0;
        current.conflictAttempt = 0;
        current.retryAfterInFlight = false;
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
