const DEFAULT_COLUMN_WIDTH = 73;
const DEFAULT_ROW_HEIGHT = 19;
const DEFAULT_ROW_HEADER_WIDTH = 46;
const DEFAULT_COLUMN_HEADER_HEIGHT = 20;

export type SheetGridLayout = Readonly<{
  zoomRatio: number;
  rowHeaderWidth: number;
  columnHeaderHeight: number;
  defaultColumnWidth: number;
  defaultRowHeight: number;
  columnWidths: Readonly<Record<string, number>>;
  rowHeights: Readonly<Record<string, number>>;
  hiddenColumns: Readonly<Record<string, unknown>>;
  hiddenRows: Readonly<Record<string, unknown>>;
}>;

export type FortuneSheetLayoutSource = {
  config?: unknown;
  columnWidths?: unknown;
  zoomRatio?: unknown;
  defaultRowHeight?: unknown;
  defaultColWidth?: unknown;
};

function recordOr(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function configRecords(value: unknown): {
  root: Record<string, unknown>;
  nested: Record<string, unknown>;
} {
  const root = recordOr(value);
  return { root, nested: recordOr(root.config) };
}

function configValue(
  source: FortuneSheetLayoutSource,
  root: Record<string, unknown>,
  nested: Record<string, unknown>,
  key: string,
): unknown {
  return source[key as keyof FortuneSheetLayoutSource] ?? root[key] ?? nested[key];
}

function copyNumberRecord(value: unknown, fallback: unknown): Readonly<Record<string, number>> {
  const result: Record<string, number> = {};
  const primary = recordOr(value);
  const secondary = recordOr(fallback);

  for (const [key, entry] of Object.entries(secondary)) {
    if (typeof entry === "number" && Number.isFinite(entry) && entry > 0) result[key] = entry;
  }
  for (const [key, entry] of Object.entries(primary)) {
    if (typeof entry === "number" && Number.isFinite(entry) && entry > 0) result[key] = entry;
  }

  return result;
}

function copyRecord(value: unknown): Readonly<Record<string, unknown>> {
  return { ...recordOr(value) };
}

/** Converts the editor's FortuneSheet shape into the layout consumed by chart geometry. */
export function adaptFortuneSheetLayout(source: FortuneSheetLayoutSource): SheetGridLayout {
  const { root, nested } = configRecords(source.config);
  const columnlen = configValue(source, root, nested, "columnlen");
  const rowlen = configValue(source, root, nested, "rowlen");

  return {
    zoomRatio: numberOr(configValue(source, root, nested, "zoomRatio"), 1),
    rowHeaderWidth: DEFAULT_ROW_HEADER_WIDTH,
    columnHeaderHeight: DEFAULT_COLUMN_HEADER_HEIGHT,
    defaultColumnWidth: numberOr(
      configValue(source, root, nested, "defaultColWidth"),
      DEFAULT_COLUMN_WIDTH,
    ),
    defaultRowHeight: numberOr(
      configValue(source, root, nested, "defaultRowHeight"),
      DEFAULT_ROW_HEIGHT,
    ),
    columnWidths: copyNumberRecord(columnlen, source.columnWidths),
    rowHeights: copyNumberRecord(rowlen, undefined),
    hiddenColumns: copyRecord(configValue(source, root, nested, "colhidden")),
    hiddenRows: copyRecord(configValue(source, root, nested, "rowhidden")),
  };
}
