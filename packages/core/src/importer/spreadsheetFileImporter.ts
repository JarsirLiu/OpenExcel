import { transformExcelToFortune } from "@corbe30/fortune-excel";
import XLSX from "xlsx-js-style";
import {
  extractMergesFromCelldata,
  type FortuneCell,
  type FortuneCellValue,
  normalizeFortuneCellData,
} from "../excel/celldataUtils.js";
import { excelAutoFilterRefToFortune } from "../excel/excelFilter.js";
import { normalizeFortuneFormula } from "../excel/fortuneCellValue.js";
import {
  type ExcelColorInput,
  excelBorderStyleToFortune,
  excelColorToFortune,
  excelHorizontalToFortune,
  excelVerticalToFortune,
  excelWrapToFortune,
} from "../excel/fortuneStyle.js";
import { toJsonObject, toJsonValue } from "../excel/jsonValue.js";
import {
  extractSheetConfig,
  type FilterSelection,
  type SheetConfig,
} from "../excel/sheetConfig.js";
import type { ImportedSheetInput, ImportedWorkbookInput } from "../excel/workbookImport.js";

export type SpreadsheetFileFormat = "xlsx" | "xls" | "csv";

export type SpreadsheetFileInput = {
  fileName: string;
  format: SpreadsheetFileFormat;
  bytes: Uint8Array | ArrayBuffer;
};

type FortuneExcelSheet = {
  name?: unknown;
  celldata?: unknown;
  [key: string]: unknown;
};

type NodeCompatibleFile = {
  new (
    ...args: unknown[]
  ): Uint8Array & {
    name: string;
    type: string;
    arrayBuffer(): Promise<ArrayBuffer>;
    text(): Promise<string>;
  };
};

type RuntimeGlobals = {
  process?: { versions?: { node?: string } };
  File?: NodeCompatibleFile;
  window?: { navigator?: { userAgent?: string } };
};

let fortuneExcelQueue = Promise.resolve();

async function runFortuneExcel<T>(task: () => Promise<T>): Promise<T> {
  const previous = fortuneExcelQueue;
  let release!: () => void;
  fortuneExcelQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;

  const globalObject = globalThis as unknown as RuntimeGlobals;
  const isNode = globalObject.process?.versions?.node != null;
  const previousFile = globalObject.File;
  const previousWindow = globalObject.window;

  if (isNode) {
    const nodeFile = function nodeFile(...args: unknown[]) {
      const parts = (args[0] as readonly unknown[]) ?? [];
      const name = String(args[1] ?? "");
      const options = (args[2] as { type?: string } | undefined) ?? {};
      const chunks = parts.map((part) => {
        if (part instanceof ArrayBuffer) return new Uint8Array(part);
        if (part instanceof Uint8Array) return part;
        return new TextEncoder().encode(String(part));
      });
      const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      Object.defineProperties(bytes, {
        name: { value: name },
        type: { value: options.type ?? "" },
        arrayBuffer: {
          value: async () =>
            bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        },
        text: { value: async () => new TextDecoder().decode(bytes) },
      });
      return bytes as Uint8Array & {
        name: string;
        type: string;
        arrayBuffer(): Promise<ArrayBuffer>;
        text(): Promise<string>;
      };
    };
    globalObject.File = nodeFile as unknown as NodeCompatibleFile;
    if (!globalObject.window) {
      globalObject.window = { navigator: { userAgent: "OpenExcel/Node" } };
    } else if (!globalObject.window.navigator) {
      globalObject.window.navigator = { userAgent: "OpenExcel/Node" };
    }
  }

  try {
    return await task();
  } finally {
    if (isNode) {
      globalObject.File = previousFile;
      globalObject.window = previousWindow;
    }
    release();
  }
}

function toUint8Array(bytes: Uint8Array | ArrayBuffer): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

function validateContainerSignature(input: SpreadsheetFileInput, bytes: Uint8Array): void {
  if (input.format === "xlsx" && (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b)) {
    throw new Error("XLSX 文件格式无效");
  }
  if (
    input.format === "xls" &&
    ![0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((byte, index) => bytes[index] === byte)
  ) {
    throw new Error("XLS 文件格式无效");
  }
}

type SheetJsStyle = {
  font?: {
    name?: string;
    sz?: number;
    bold?: boolean;
    italic?: boolean;
    strike?: boolean;
    underline?: boolean;
    color?: ExcelColorInput;
  };
  fill?: { fgColor?: ExcelColorInput };
  alignment?: { horizontal?: string; vertical?: string; wrapText?: boolean };
  border?: {
    top?: SheetJsBorderSide;
    bottom?: SheetJsBorderSide;
    left?: SheetJsBorderSide;
    right?: SheetJsBorderSide;
  };
};

type SheetJsBorderSide = {
  style?: string | number;
  color?: ExcelColorInput;
};

type MergeEntry = {
  range: XLSX.Range;
  config: { r: number; c: number; rs: number; cs: number };
  order: number;
};

function workbookNameFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "") || "未命名工作簿";
}

function normalizeBorderSide(side?: SheetJsBorderSide) {
  if (!side?.style) return undefined;
  const style = excelBorderStyleToFortune(side.style);
  if (!style) return undefined;
  return { s: style, c: excelColorToFortune(side.color) };
}

function toFortuneValue(cell: XLSX.CellObject): FortuneCellValue {
  const rawValue = cell.v ?? "";
  const value: FortuneCellValue = {
    v: rawValue,
    m: cell.w ?? String(rawValue),
  };

  if (cell.f) value.f = normalizeFortuneFormula(cell.f);
  if (cell.z) value.ct = { fa: String(cell.z), t: cell.t };

  const style = cell.s as SheetJsStyle | undefined;
  if (style?.font) {
    value.ff = style.font.name;
    value.fs = style.font.sz;
    value.bl = style.font.bold ? 1 : undefined;
    value.it = style.font.italic ? 1 : undefined;
    value.cl = style.font.strike ? 1 : undefined;
    value.un = style.font.underline ? 1 : undefined;
    value.fc = excelColorToFortune(style.font.color);
  }
  value.bg = excelColorToFortune(style?.fill?.fgColor);

  const alignment = style?.alignment;
  if (alignment?.horizontal) value.ht = excelHorizontalToFortune(alignment.horizontal);
  if (alignment?.vertical) value.vt = excelVerticalToFortune(alignment.vertical);
  if (alignment?.wrapText != null) value.tb = excelWrapToFortune(alignment.wrapText);

  const border = style?.border;
  if (border) {
    const normalizedBorder = {
      t: normalizeBorderSide(border.top),
      b: normalizeBorderSide(border.bottom),
      l: normalizeBorderSide(border.left),
      r: normalizeBorderSide(border.right),
    };
    if (Object.values(normalizedBorder).some(Boolean)) value.bd = normalizedBorder;
  }

  return value;
}

function compareMergeEntries(left: MergeEntry, right: MergeEntry): number {
  return left.range.s.c - right.range.s.c || left.order - right.order;
}

function createMergeIndex(merges: readonly XLSX.Range[]) {
  const rows = new Map<number, MergeEntry[]>();
  merges.forEach((range, order) => {
    const entry: MergeEntry = {
      range,
      order,
      config: {
        r: range.s.r,
        c: range.s.c,
        rs: range.e.r - range.s.r + 1,
        cs: range.e.c - range.s.c + 1,
      },
    };
    for (let row = range.s.r; row <= range.e.r; row += 1) {
      const bucket = rows.get(row);
      if (bucket) bucket.push(entry);
      else rows.set(row, [entry]);
    }
  });

  for (const bucket of rows.values()) {
    bucket.sort(compareMergeEntries);
    for (let index = 1; index < bucket.length; index += 1) {
      if (bucket[index - 1].range.e.c >= bucket[index].range.s.c) {
        throw new Error("Excel 文件包含重叠的合并区域");
      }
    }
  }

  return (row: number, column: number): MergeEntry | undefined => {
    const bucket = rows.get(row);
    if (!bucket) return undefined;
    let low = 0;
    let high = bucket.length - 1;
    let candidate = -1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (bucket[middle].range.s.c <= column) {
        candidate = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    const entry = candidate >= 0 ? bucket[candidate] : undefined;
    return entry && column <= entry.range.e.c ? entry : undefined;
  };
}

function toMergeConfig(merges: readonly XLSX.Range[]) {
  const merge: Record<string, { r: number; c: number; rs: number; cs: number }> = {};
  for (const range of merges) {
    const ref = XLSX.utils.encode_cell({ r: range.s.r, c: range.s.c });
    merge[ref] = {
      r: range.s.r,
      c: range.s.c,
      rs: range.e.r - range.s.r + 1,
      cs: range.e.c - range.s.c + 1,
    };
  }
  return merge;
}

function normalizeImportedCelldata(input: unknown): FortuneCell[] {
  if (!Array.isArray(input)) return [];

  const celldata = input.map((rawCell) => {
    if (!rawCell || typeof rawCell !== "object" || Array.isArray(rawCell)) {
      return rawCell as FortuneCell;
    }

    const cell = rawCell as { r?: unknown; c?: unknown; v?: unknown };
    const rawValue = toJsonValue(cell.v);
    const value: Record<string, unknown> =
      rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)
        ? { ...(rawValue as Record<string, unknown>) }
        : { v: rawValue };
    if (value.v === undefined) value.v = "";
    if (value.m == null) value.m = value.v == null ? "" : String(value.v);
    else if (typeof value.m !== "string") value.m = String(value.m);

    return {
      r: Number(cell.r),
      c: Number(cell.c),
      v: value as unknown as FortuneCellValue,
    };
  });

  return normalizeFortuneCellData(celldata, { inferGeneralNumeric: true });
}

function normalizeFortuneSheet(sheet: FortuneExcelSheet, index: number): ImportedSheetInput {
  const name =
    typeof sheet.name === "string" && sheet.name.trim() ? sheet.name : `Sheet${index + 1}`;
  const celldata = normalizeImportedCelldata(sheet.celldata);
  return {
    name,
    celldata,
    merges: extractMergesFromCelldata(celldata),
    config: toJsonObject(extractSheetConfig(sheet)) as SheetConfig,
  };
}

function readXlsxAutoFilterSelections(bytes: Uint8Array): (FilterSelection | undefined)[] {
  try {
    const workbook = XLSX.read(bytes, {
      type: "array",
      cellDates: false,
      cellFormula: false,
      cellStyles: false,
      raw: true,
    });
    return workbook.SheetNames.map((name) =>
      excelAutoFilterRefToFortune(workbook.Sheets[name]?.["!autofilter"]?.ref),
    );
  } catch {
    // FortuneExcel remains the source of truth for cells and styles. Metadata
    // recovery is best-effort so an unsupported optional feature never blocks import.
    return [];
  }
}

async function parseXlsxWithFortuneExcel(
  input: SpreadsheetFileInput,
): Promise<ImportedWorkbookInput> {
  const bytes = toUint8Array(input.bytes);
  let parsedSheets: FortuneExcelSheet[] | undefined;
  await runFortuneExcel(async () => {
    const fileConstructor = (globalThis as unknown as RuntimeGlobals).File;
    if (!fileConstructor) throw new Error("当前运行环境不支持 Excel 文件解析");
    const file = new fileConstructor([bytes], input.fileName, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await transformExcelToFortune(
      file,
      (sheets: FortuneExcelSheet[]) => {
        parsedSheets = sheets;
      },
      () => undefined,
      undefined,
    );
  });

  if (!Array.isArray(parsedSheets) || parsedSheets.length === 0) {
    throw new Error("工作簿不包含可导入的工作表");
  }
  const filterSelections = readXlsxAutoFilterSelections(bytes);
  return {
    name: workbookNameFromFile(input.fileName),
    sheets: parsedSheets.map((sheet, index) => {
      const normalized = normalizeFortuneSheet(sheet, index);
      const filterSelect = filterSelections[index];
      if (!filterSelect || normalized.config.filter_select != null) return normalized;
      return {
        ...normalized,
        config: { ...normalized.config, filter_select: filterSelect },
      };
    }),
  };
}

function buildSheet(name: string, worksheet: XLSX.WorkSheet): ImportedSheetInput {
  const range = worksheet["!ref"]
    ? XLSX.utils.decode_range(worksheet["!ref"])
    : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
  const merges = worksheet["!merges"] ?? [];
  const findMerge = createMergeIndex(merges);
  const celldata: FortuneCell[] = [];

  for (let r = range.s.r; r <= range.e.r; r += 1) {
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const ref = XLSX.utils.encode_cell({ r, c });
      const cell = worksheet[ref] as XLSX.CellObject | undefined;
      const merge = findMerge(r, c);
      if (!cell && !merge) continue;

      const value = cell ? toFortuneValue(cell) : { v: "", m: "" };
      if (merge) {
        value.mc =
          merge.range.s.r === r && merge.range.s.c === c
            ? merge.config
            : { r: merge.config.r, c: merge.config.c };
      }
      celldata.push({ r, c, v: value });
    }
  }

  const layout: Record<string, unknown> = {};
  if (merges.length > 0) layout.merge = toMergeConfig(merges);
  if (worksheet["!cols"]) {
    layout.columnlen = Object.fromEntries(
      worksheet["!cols"]
        .map((column, index) => [index, column?.wch != null ? column.wch * 7 : undefined])
        .filter(([, width]) => width != null),
    );
  }
  if (worksheet["!rows"]) {
    layout.rowlen = Object.fromEntries(
      worksheet["!rows"]
        .map((row, index) => [index, row?.hpt])
        .filter(([, height]) => height != null),
    );
  }

  const config: SheetConfig = {};
  if (Object.keys(layout).length > 0) config.config = layout;
  const filterSelect = excelAutoFilterRefToFortune(worksheet["!autofilter"]?.ref);
  if (filterSelect) config.filter_select = filterSelect;

  return {
    name,
    celldata: normalizeFortuneCellData(celldata),
    merges: merges.map((merge) => ({
      row: [merge.s.r, merge.e.r],
      col: [merge.s.c, merge.e.c],
    })),
    config,
  };
}

export async function parseSpreadsheetFile(
  input: SpreadsheetFileInput,
): Promise<ImportedWorkbookInput> {
  const bytes = toUint8Array(input.bytes);
  validateContainerSignature(input, bytes);
  if (input.format === "xlsx") return parseXlsxWithFortuneExcel({ ...input, bytes });

  const csv = input.format === "csv";
  const workbook = XLSX.read(csv ? new TextDecoder().decode(bytes) : bytes, {
    type: csv ? "string" : "array",
    cellDates: false,
    cellFormula: true,
    cellNF: true,
    cellStyles: true,
    raw: true,
  });

  const sheets = workbook.SheetNames.map((name) => buildSheet(name, workbook.Sheets[name]));
  if (sheets.length === 0) throw new Error("工作簿不包含可导入的工作表");
  return { name: workbookNameFromFile(input.fileName), sheets };
}
