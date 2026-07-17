import type { FortuneCell } from "../excel/celldataUtils.js";
import {
  storageIndex,
  storageRangeToTool,
  type ToolIndex,
  type ToolRange,
  toolIndexToStorage,
} from "./sheetCoordinates.js";

function requirePositiveSpan(value: number | undefined, name: string): number {
  const span = value ?? 1;
  if (!Number.isInteger(span) || span < 1) throw new Error(`${name} must be positive`);
  return span;
}

export function fortuneMergesToToolRanges(celldata: FortuneCell[]): ToolRange[] {
  const ranges: ToolRange[] = [];
  const seen = new Set<string>();
  for (const cell of celldata) {
    const merge = cell.v?.mc;
    if (!merge || merge.r !== cell.r || merge.c !== cell.c) continue;

    const startRow = storageIndex(merge.r);
    const startCol = storageIndex(merge.c);
    const rowSpan = requirePositiveSpan(merge.rs, "merge row span");
    const colSpan = requirePositiveSpan(merge.cs, "merge column span");
    const key = `${startRow},${startCol},${rowSpan},${colSpan}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ranges.push(
      storageRangeToTool({
        startRow,
        startCol,
        endRow: storageIndex(startRow + rowSpan - 1),
        endCol: storageIndex(startCol + colSpan - 1),
      }),
    );
  }
  return ranges;
}

function toolColumnToA1(column: ToolIndex): string {
  let index: number = toolIndexToStorage(column);
  let result = "";
  while (index >= 0) {
    result = String.fromCharCode(65 + (index % 26)) + result;
    index = Math.floor(index / 26) - 1;
  }
  return result;
}

export function toolCellToA1Ref(row: ToolIndex, col: ToolIndex): string {
  return `${toolColumnToA1(col)}${row}`;
}

export function toolRangeToA1Ref(range: ToolRange): string {
  return `${toolCellToA1Ref(range.startRow, range.startCol)}:${toolCellToA1Ref(range.endRow, range.endCol)}`;
}
