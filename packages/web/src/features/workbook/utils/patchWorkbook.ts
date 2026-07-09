import { type SheetChangeDelta, sheetChangeDeltaToZeroBased } from "@openexcel/core";
import type { SheetSchema, WorkbookFull } from "@/api/workbooks";

function toColRef(c: number): string {
  let ref = "";
  let n = c;
  while (n >= 0) {
    ref = String.fromCharCode(65 + (n % 26)) + ref;
    n = Math.floor(n / 26) - 1;
  }
  return ref;
}

function parseConfig(config: any): Record<string, any> {
  if (!config) return {};
  if (typeof config === "string") {
    try {
      return JSON.parse(config);
    } catch {
      return {};
    }
  }
  return config;
}

/**
 * Incrementally patch a WorkbookFull with minimal delta data.
 * Public sheet change deltas are 1-based; we normalize them to internal 0-based indices here.
 * Delta types:
 *   - { type: "write", cells: [{row, col, value}], merges: [...] }
 *   - { type: "clear", operations: [{type: "cell", ...} | {type: "range", ...}] }
 *   - { type: "merge",   operations: [{ type: "range", ... }] }
 *   - { type: "unmerge", operations: [{ type: "range", ... }] }
 */
export function patchWorkbookWithDelta(
  workbook: WorkbookFull,
  sheetId: number,
  delta: SheetChangeDelta,
): WorkbookFull | null {
  const internalDelta = sheetChangeDeltaToZeroBased(delta);
  const sheetIndex = workbook.sheets.findIndex((s) => s.id === sheetId);
  if (sheetIndex === -1) return null;

  const sheet = workbook.sheets[sheetIndex];
  const celldata: any[] = sheet.uploadedData ? [...sheet.uploadedData] : [];

  const cellMap = new Map<string, any>();
  for (const cell of celldata) {
    if (cell.r != null && cell.c != null) {
      cellMap.set(`${cell.r},${cell.c}`, cell);
    }
  }

  const config = parseConfig(sheet.config);
  if (!config.merge) config.merge = {};

  if (internalDelta.type === "write") {
    const { cells, merges } = internalDelta;
    if (!Array.isArray(cells)) return null;

    // Patch cell values
    for (const { row, col, value, formula } of cells) {
      const key = `${row},${col}`;
      const newVal = value ?? "";
      const normalizedFormula = typeof formula === "string" ? formula.trim().replace(/^=/, "") : "";
      const hasFormula = normalizedFormula.length > 0;

      if (hasFormula) {
        const nextValue = cellMap.has(key) ? { ...(cellMap.get(key).v ?? {}) } : {};
        nextValue.f = normalizedFormula;
        if (value !== undefined && newVal !== "") {
          nextValue.v = newVal;
          nextValue.m = String(newVal);
        } else {
          delete nextValue.v;
          delete nextValue.m;
        }
        if (cellMap.has(key)) {
          const cell = cellMap.get(key);
          cell.v = nextValue;
        } else {
          cellMap.set(key, { r: row, c: col, v: nextValue });
        }
        continue;
      }

      if (newVal === "") {
        cellMap.delete(key);
        continue;
      }

      if (cellMap.has(key)) {
        const cell = cellMap.get(key);
        const nextValue = { ...(cell.v ?? {}) };
        delete nextValue.f;
        cell.v = {
          ...nextValue,
          v: newVal,
          m: String(newVal),
        };
      } else {
        cellMap.set(key, { r: row, c: col, v: { v: newVal, m: String(newVal) } });
      }
    }

    // Patch merges (if any write affected merge areas)
    for (const m of merges ?? []) {
      const rs = m.endRow - m.startRow + 1;
      const cs = m.endCol - m.startCol + 1;
      for (let r = m.startRow; r <= m.endRow; r++) {
        for (let c = m.startCol; c <= m.endCol; c++) {
          const key = `${r},${c}`;
          const cell = cellMap.get(key);
          if (cell) {
            cell.v = { ...cell.v, mc: { r: m.startRow, c: m.startCol, rs, cs } };
          }
        }
      }
    }

    // Update config.merge for any merge changes
    if (merges && merges.length > 0) {
      for (const m of merges) {
        const colRef = toColRef(m.startCol);
        const cellRef = `${colRef}${m.startRow + 1}`;
        config.merge[cellRef] = {
          r: m.startRow,
          c: m.startCol,
          rs: m.endRow - m.startRow + 1,
          cs: m.endCol - m.startCol + 1,
        };
      }
    }
  } else if (internalDelta.type === "clear") {
    for (const operation of internalDelta.operations) {
      if (operation.type === "cell") {
        const key = `${operation.row},${operation.col}`;
        const cell = cellMap.get(key);
        if (!cell?.v) continue;
        const { v: _cellValue, m: _displayValue, f: _formula, ...rest } = cell.v;
        if (Object.keys(rest).length > 0) {
          cell.v = rest;
        } else {
          cellMap.delete(key);
        }
        continue;
      }

      for (const [key, cell] of cellMap) {
        if (
          cell.r >= operation.startRow &&
          cell.r <= operation.endRow &&
          cell.c >= operation.startCol &&
          cell.c <= operation.endCol
        ) {
          if (!cell.v) continue;
          const { v: _cellValue, m: _displayValue, f: _formula, ...rest } = cell.v;
          if (Object.keys(rest).length > 0) {
            cell.v = rest;
          } else {
            cellMap.delete(key);
          }
        }
      }
    }
  } else if (internalDelta.type === "merge") {
    for (const range of internalDelta.operations) {
      const { startRow, startCol, endRow, endCol } = range;
      const rs = endRow - startRow + 1;
      const cs = endCol - startCol + 1;

      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          const key = `${r},${c}`;
          if (r === startRow && c === startCol) {
            // Top-left: keep value, add mc
            const cell = cellMap.get(key) ?? { r, c, v: {} };
            cell.v = { ...cell.v, mc: { r: startRow, c: startCol, rs, cs } };
            cellMap.set(key, cell);
          } else {
            // Other cells: clear value, add mc
            const cell = cellMap.get(key) ?? { r, c, v: {} };
            cell.v = { mc: { r: startRow, c: startCol, rs, cs } };
            cellMap.set(key, cell);
          }
        }
      }
    }

    // Update config.merge
    for (const range of internalDelta.operations) {
      const colRef = toColRef(range.startCol);
      const cellRef = `${colRef}${range.startRow + 1}`;
      config.merge[cellRef] = {
        r: range.startRow,
        c: range.startCol,
        rs: range.endRow - range.startRow + 1,
        cs: range.endCol - range.startCol + 1,
      };
    }
  } else if (internalDelta.type === "unmerge") {
    for (const range of internalDelta.operations) {
      const { startRow, startCol, endRow, endCol } = range;

      // Clear mc from all cells in range
      for (const [key, cell] of cellMap) {
        if (cell.r >= startRow && cell.r <= endRow && cell.c >= startCol && cell.c <= endCol) {
          if (cell.v?.mc) {
            const { mc, ...rest } = cell.v;
            cell.v = rest;
          }
        }
      }

      // Remove merge from config
      if (config.merge) {
        for (const cellRef of Object.keys(config.merge)) {
          const m = (config.merge as Record<string, { r: number; c: number }>)[cellRef];
          if (m.r >= startRow && m.r <= endRow && m.c >= startCol && m.c <= endCol) {
            delete config.merge[cellRef];
          }
        }
      }
    }
  } else {
    return null;
  }

  // Rebuild celldata
  const updatedCelldata = Array.from(cellMap.values());

  const updatedSheet: SheetSchema = {
    ...sheet,
    uploadedData: updatedCelldata,
    config: JSON.stringify(config),
  };

  return {
    ...workbook,
    sheets: [
      ...workbook.sheets.slice(0, sheetIndex),
      updatedSheet,
      ...workbook.sheets.slice(sheetIndex + 1),
    ],
  };
}
