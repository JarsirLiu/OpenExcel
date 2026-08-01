import type { FortuneCell, SheetConfig } from "@openexcel/core";
import type { WorkbookFull } from "@/api/workbooks";
import type { SheetEditorChange } from "@/features/sync/sheetEditorChange";
import { mergeWorkbookSnapshot } from "@/features/sync/workbookRevision";

type SheetCellCache = {
  source: readonly FortuneCell[];
  indexes: Map<string, number>;
};

type Listener = () => void;

export type WorkbookDocumentChange =
  | { kind: "workbook" }
  | {
      kind: "sheet";
      sheetId: number;
      cells: readonly { row: number; col: number }[];
      structural: boolean;
      configChanged: boolean;
    };

type ChangeListener = (change: WorkbookDocumentChange) => void;

type SheetPatch = Extract<SheetEditorChange, { kind: "patch" }>["mutation"];

type PendingCellChange = {
  row: number;
  col: number;
  cell: Record<string, unknown> | null;
  version: number;
};

type PendingSheetChanges = {
  snapshot: { change: Extract<SheetEditorChange, { kind: "snapshot" }>; version: number } | null;
  cells: Map<string, PendingCellChange>;
  config: { config: SheetConfig | null; version: number } | null;
};

function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

function configSignature(config: SheetConfig | null): string {
  return JSON.stringify(config);
}

function createCellCache(celldata: readonly FortuneCell[]): SheetCellCache {
  return {
    source: celldata,
    indexes: new Map(celldata.map((cell, index) => [cellKey(cell.r, cell.c), index])),
  };
}

function applySheetPatch(
  cache: SheetCellCache,
  patch: SheetPatch,
): { celldata: FortuneCell[]; cache: SheetCellCache } {
  const nextCelldata: (FortuneCell | null)[] = [...cache.source];
  let indexes = cache.indexes;
  let requiresCompaction = false;

  const ensureWritableIndexes = () => {
    if (indexes === cache.indexes) indexes = new Map(indexes);
  };

  for (const change of patch.cells) {
    const row = change.row - 1;
    const col = change.col - 1;
    const key = cellKey(row, col);
    const index = indexes.get(key);
    if (change.cell === null) {
      if (index !== undefined) {
        nextCelldata[index] = null;
        ensureWritableIndexes();
        indexes.delete(key);
        requiresCompaction = true;
      }
      continue;
    }

    const nextCell = {
      r: row,
      c: col,
      v: { ...change.cell } as unknown as FortuneCell["v"],
    };
    if (index === undefined) {
      ensureWritableIndexes();
      indexes.set(key, nextCelldata.length);
      nextCelldata.push(nextCell);
      requiresCompaction = true;
    } else {
      nextCelldata[index] = nextCell;
    }
  }

  if (requiresCompaction) {
    const compacted = nextCelldata.filter((cell): cell is FortuneCell => cell !== null);
    compacted.sort((left, right) => left.r - right.r || left.c - right.c);
    return { celldata: compacted, cache: createCellCache(compacted) };
  }

  const celldata = nextCelldata as FortuneCell[];
  return { celldata, cache: { source: celldata, indexes } };
}

/** Owns the browser's current workbook document and its focused subscriptions. */
export class WorkbookDocumentStore {
  private currentWorkbook: WorkbookFull | null;

  private readonly listeners = new Set<ChangeListener>();

  private readonly sheetCellCache = new Map<number, SheetCellCache>();

  private readonly pendingChangesBySheet = new Map<number, PendingSheetChanges>();

  private readonly changeVersionBySheet = new Map<number, number>();

  constructor(initialWorkbook: WorkbookFull | null) {
    this.currentWorkbook = initialWorkbook;
  }

  getSnapshot = (): WorkbookFull | null => this.currentWorkbook;

  subscribe = (listener: Listener): (() => void) => {
    const changeListener: ChangeListener = () => listener();
    this.listeners.add(changeListener);
    return () => this.listeners.delete(changeListener);
  };

  subscribeToChanges = (listener: ChangeListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  replace(next: WorkbookFull | null): WorkbookFull | null {
    this.sheetCellCache.clear();
    this.pendingChangesBySheet.clear();
    this.changeVersionBySheet.clear();
    this.currentWorkbook = next;
    this.emit({ kind: "workbook" });
    return next;
  }

  updateSheetContent(change: SheetEditorChange): WorkbookFull | null {
    const current = this.currentWorkbook;
    const currentSheet = current?.sheets.find((sheet) => sheet.id === change.sheetId);
    if (!current || !currentSheet) return null;

    const currentCelldata = (currentSheet.uploadedData ?? []) as FortuneCell[];
    const cached = this.sheetCellCache.get(change.sheetId);
    const cache = cached?.source === currentCelldata ? cached : createCellCache(currentCelldata);
    const patchResult = change.kind === "patch" ? applySheetPatch(cache, change.mutation) : null;
    const nextCelldata =
      change.kind === "patch"
        ? (patchResult?.celldata ?? currentCelldata)
        : change.snapshot.celldata;
    const nextConfig: SheetConfig | null =
      change.kind === "patch"
        ? change.mutation.config === undefined
          ? currentSheet.config
          : change.mutation.config
        : change.snapshot.config;
    const configChanged =
      change.kind === "snapshot" ||
      configSignature(currentSheet.config) !== configSignature(nextConfig);

    this.sheetCellCache.set(change.sheetId, patchResult?.cache ?? createCellCache(nextCelldata));
    this.currentWorkbook = {
      ...current,
      sheets: current.sheets.map((sheet) =>
        sheet.id === change.sheetId
          ? { ...sheet, uploadedData: nextCelldata, config: nextConfig }
          : sheet,
      ),
    };
    const version = (this.changeVersionBySheet.get(change.sheetId) ?? 0) + 1;
    this.changeVersionBySheet.set(change.sheetId, version);
    const pending = this.pendingChangesBySheet.get(change.sheetId) ?? {
      snapshot: null,
      cells: new Map(),
      config: null,
    };
    if (change.kind === "snapshot") {
      pending.snapshot = { change, version };
      pending.cells.clear();
      pending.config = null;
    } else {
      for (const cell of change.mutation.cells) {
        pending.cells.set(`${cell.row},${cell.col}`, { ...cell, version });
      }
      if (change.mutation.config !== undefined) {
        pending.config = { config: change.mutation.config as SheetConfig | null, version };
      }
    }
    this.pendingChangesBySheet.set(change.sheetId, pending);
    this.emit({
      kind: "sheet",
      sheetId: change.sheetId,
      cells:
        change.kind === "patch"
          ? change.mutation.cells.map((cell) => ({ row: cell.row - 1, col: cell.col - 1 }))
          : [],
      structural: change.kind === "snapshot",
      configChanged,
    });
    return this.currentWorkbook;
  }

  getSheetChangeVersion(sheetId: number): number {
    return this.changeVersionBySheet.get(sheetId) ?? 0;
  }

  updateSheetRevision(
    sheetId: number,
    revision: number,
    persistedThroughVersion?: number,
  ): WorkbookFull | null {
    if (persistedThroughVersion !== undefined) {
      const pending = this.pendingChangesBySheet.get(sheetId);
      if (pending) {
        if (pending.snapshot && pending.snapshot.version <= persistedThroughVersion) {
          pending.snapshot = null;
        }
        for (const [key, cell] of pending.cells) {
          if (cell.version <= persistedThroughVersion) pending.cells.delete(key);
        }
        if (pending.config && pending.config.version <= persistedThroughVersion) {
          pending.config = null;
        }
        if (!pending.snapshot && pending.cells.size === 0 && !pending.config) {
          this.pendingChangesBySheet.delete(sheetId);
        }
      }
    }
    const current = this.currentWorkbook;
    const sheet = current?.sheets.find((item) => item.id === sheetId);
    if (!current || !sheet || revision <= sheet.revision) return current;
    this.currentWorkbook = {
      ...current,
      sheets: current.sheets.map((item) => (item.id === sheetId ? { ...item, revision } : item)),
    };
    this.emit({ kind: "sheet", sheetId, cells: [], structural: false, configChanged: false });
    return this.currentWorkbook;
  }

  mergeRemoteSnapshot(next: WorkbookFull): WorkbookFull | null {
    const current = this.currentWorkbook;
    if (!current || current.id !== next.id) return next;

    const merged = mergeWorkbookSnapshot(current, next);
    const sheets = merged.sheets.map((sheet) => this.applyPendingChanges(sheet));
    this.sheetCellCache.clear();
    this.currentWorkbook = { ...merged, sheets };
    this.emit({ kind: "workbook" });
    return this.currentWorkbook;
  }

  mergeRemoteSheet(nextSheet: WorkbookFull["sheets"][number]): WorkbookFull | null {
    const current = this.currentWorkbook;
    if (!current) return null;

    this.currentWorkbook = {
      ...current,
      sheets: current.sheets.map((sheet) =>
        sheet.id === nextSheet.id ? this.applyPendingChanges(nextSheet) : sheet,
      ),
    };
    this.sheetCellCache.clear();
    this.emit({ kind: "workbook" });
    return this.currentWorkbook;
  }

  updateCharts(charts: WorkbookFull["charts"]): WorkbookFull | null {
    if (!this.currentWorkbook) return null;
    this.currentWorkbook = { ...this.currentWorkbook, charts };
    this.emit({ kind: "workbook" });
    return this.currentWorkbook;
  }

  update(updater: (workbook: WorkbookFull) => WorkbookFull): WorkbookFull | null {
    if (!this.currentWorkbook) return null;
    this.currentWorkbook = updater(this.currentWorkbook);
    this.emit({ kind: "workbook" });
    return this.currentWorkbook;
  }

  private emit(change: WorkbookDocumentChange): void {
    for (const listener of this.listeners) listener(change);
  }

  private applyPendingChanges(
    sheet: WorkbookFull["sheets"][number],
  ): WorkbookFull["sheets"][number] {
    const pending = this.pendingChangesBySheet.get(sheet.id);
    if (!pending) return sheet;

    let nextSheet = sheet;
    if (pending.snapshot) {
      nextSheet = {
        ...nextSheet,
        uploadedData: pending.snapshot.change.snapshot.celldata.map((cell) => ({
          ...cell,
          v: { ...cell.v },
        })),
        config: pending.snapshot.change.snapshot.config,
      };
    }
    if (pending.cells.size > 0) {
      const cache = createCellCache((nextSheet.uploadedData ?? []) as FortuneCell[]);
      const result = applySheetPatch(cache, {
        type: "patch",
        cells: [...pending.cells.values()]
          .sort((left, right) => left.version - right.version)
          .map(({ version: _version, ...cell }) => cell),
        ...(pending.config
          ? { config: pending.config.config as Record<string, unknown> | null }
          : {}),
      });
      nextSheet = {
        ...nextSheet,
        uploadedData: result.celldata,
        config: pending.config ? pending.config.config : nextSheet.config,
      };
    } else if (pending.config) {
      nextSheet = { ...nextSheet, config: pending.config.config };
    }
    return nextSheet;
  }
}
