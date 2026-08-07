import type { FortuneCell, SheetConfig } from "@openexcel/core";
import type { WorkbookFull } from "@/api/workbooks";
import type { SheetCellChange, SheetChangeSet } from "@/features/sync/sheetChangeSet";
import type { SheetEditorChange } from "@/features/sync/sheetEditorChange";
import { mergeWorkbookSnapshot } from "@/features/sync/workbookRevision";

type SheetCellCache = {
  source: readonly FortuneCell[];
  indexes: Map<string, number>;
};

type Listener = () => void;

export type WorkbookDocumentChange =
  | { kind: "workbook" }
  | { kind: "charts" }
  | {
      kind: "sheet";
      sheetId: number;
      cells: readonly { row: number; col: number }[];
      structural: boolean;
      configChanged: boolean;
    };

type ChangeListener = (change: WorkbookDocumentChange) => void;

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

function applyCellChanges(
  cache: SheetCellCache,
  changes: readonly SheetCellChange[],
): { celldata: FortuneCell[]; cache: SheetCellCache } {
  const nextCelldata: (FortuneCell | null)[] = [...cache.source];
  let indexes = cache.indexes;
  let requiresCompaction = false;

  const ensureWritableIndexes = () => {
    if (indexes === cache.indexes) indexes = new Map(indexes);
  };

  for (const change of changes) {
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

    const previousCell = index === undefined ? undefined : nextCelldata[index];
    const nextValue: Record<string, unknown> = {
      ...((previousCell?.v ?? {}) as unknown as Record<string, unknown>),
      ...change.cell,
    };
    for (const field of change.removed ?? []) delete nextValue[field];
    const nextCell = {
      r: row,
      c: col,
      v: nextValue as unknown as FortuneCell["v"],
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

function applySheetChangeSet(
  cache: SheetCellCache,
  changeSet: SheetChangeSet,
): { celldata: FortuneCell[]; cache: SheetCellCache; config?: SheetConfig | null } {
  let result = { celldata: [...cache.source], cache };
  for (const changes of [
    changeSet.valueChanges,
    changeSet.formulaCacheChanges,
    changeSet.formatChanges,
  ]) {
    result = applyCellChanges(result.cache, changes);
  }
  const configChange = changeSet.configChanges.at(-1);
  return {
    ...result,
    ...(configChange ? { config: configChange.config } : {}),
  };
}

/** Owns the browser's current workbook document and its focused subscriptions. */
export class WorkbookDocumentStore {
  private currentWorkbook: WorkbookFull | null;

  private readonly listeners = new Set<ChangeListener>();

  private readonly sheetCellCache = new Map<number, SheetCellCache>();

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
    const changeSetResult =
      change.kind === "patch" ? applySheetChangeSet(cache, change.changeSet) : null;
    const nextCelldata =
      change.kind === "patch"
        ? (changeSetResult?.celldata ?? currentCelldata)
        : change.snapshot.celldata;
    const nextConfig: SheetConfig | null =
      change.kind === "patch"
        ? changeSetResult?.config === undefined
          ? currentSheet.config
          : changeSetResult.config
        : change.snapshot.config;
    const configChanged =
      change.kind === "snapshot" ||
      configSignature(currentSheet.config) !== configSignature(nextConfig);

    this.sheetCellCache.set(
      change.sheetId,
      changeSetResult?.cache ?? createCellCache(nextCelldata),
    );
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
    this.emit({
      kind: "sheet",
      sheetId: change.sheetId,
      cells:
        change.kind === "patch"
          ? [
              ...change.changeSet.valueChanges,
              ...change.changeSet.formulaCacheChanges,
              ...change.changeSet.formatChanges,
            ].map((cell) => ({ row: cell.row - 1, col: cell.col - 1 }))
          : [],
      structural: change.kind === "snapshot",
      configChanged,
    });
    return this.currentWorkbook;
  }

  /** Applies a server-confirmed change without creating browser-pending state. */
  applyCommittedSheetChange(
    change: Extract<SheetEditorChange, { kind: "patch" }>,
    revision: number,
  ): WorkbookFull | null {
    const current = this.currentWorkbook;
    const currentSheet = current?.sheets.find((sheet) => sheet.id === change.sheetId);
    if (!current || !currentSheet) return null;

    const currentCelldata = (currentSheet.uploadedData ?? []) as FortuneCell[];
    const cached = this.sheetCellCache.get(change.sheetId);
    const cache = cached?.source === currentCelldata ? cached : createCellCache(currentCelldata);
    const changeSetResult = applySheetChangeSet(cache, change.changeSet);
    const nextConfig =
      changeSetResult.config === undefined ? currentSheet.config : changeSetResult.config;
    const configChanged = configSignature(currentSheet.config) !== configSignature(nextConfig);
    const nextSheet = {
      ...currentSheet,
      uploadedData: changeSetResult.celldata,
      config: nextConfig,
      revision: Math.max(currentSheet.revision, revision),
    };

    this.sheetCellCache.set(change.sheetId, changeSetResult.cache);
    this.currentWorkbook = {
      ...current,
      sheets: current.sheets.map((sheet) => (sheet.id === change.sheetId ? nextSheet : sheet)),
    };
    this.emit({
      kind: "sheet",
      sheetId: change.sheetId,
      cells: [
        ...change.changeSet.valueChanges,
        ...change.changeSet.formulaCacheChanges,
        ...change.changeSet.formatChanges,
      ].map((cell) => ({ row: cell.row - 1, col: cell.col - 1 })),
      structural: false,
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
    this.sheetCellCache.clear();
    this.currentWorkbook = merged;
    this.emit({ kind: "workbook" });
    return this.currentWorkbook;
  }

  mergeRemoteSheet(nextSheet: WorkbookFull["sheets"][number]): WorkbookFull | null {
    const current = this.currentWorkbook;
    if (!current) return null;

    this.currentWorkbook = {
      ...current,
      sheets: current.sheets.map((sheet) => (sheet.id === nextSheet.id ? nextSheet : sheet)),
    };
    this.sheetCellCache.clear();
    this.emit({ kind: "workbook" });
    return this.currentWorkbook;
  }

  updateCharts(charts: WorkbookFull["charts"]): WorkbookFull | null {
    if (!this.currentWorkbook) return null;
    this.currentWorkbook = { ...this.currentWorkbook, charts };
    this.emit({ kind: "charts" });
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
}
