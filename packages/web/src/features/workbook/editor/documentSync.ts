import {
  coalesceDocumentOperations,
  type DocumentOperation,
  type FortuneCell,
  fortuneCellToDocumentValue,
} from "@openexcel/core";
import { extractMergesFromCelldata } from "./fortuneSheet";
import { isRendererHeaderRow, rendererRowToDocumentRow } from "./sheetCoordinates";

export function valueKey(value: unknown): string {
  return JSON.stringify(value) ?? "";
}

function normalizeDocumentValue(cell: FortuneCell) {
  const value = fortuneCellToDocumentValue(cell.v);
  if (!value.metadata?.mc) return value;
  const { mc: _mergeCell, ...metadata } = value.metadata;
  return {
    ...value,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

export function buildDocumentOperations(
  previous: FortuneCell[],
  next: FortuneCell[],
  headerRows: number,
): DocumentOperation[] {
  const previousByAddress = new Map(previous.map((cell) => [`${cell.r},${cell.c}`, cell]));
  const nextByAddress = new Map(next.map((cell) => [`${cell.r},${cell.c}`, cell]));
  const addresses = new Set([...previousByAddress.keys(), ...nextByAddress.keys()]);
  const operations: DocumentOperation[] = [];

  for (const address of addresses) {
    const [renderRow, renderCol] = address.split(",").map(Number);
    if (isRendererHeaderRow(renderRow, headerRows)) continue;
    const row = rendererRowToDocumentRow(renderRow, headerRows);
    const nextCell = nextByAddress.get(address);
    const previousCell = previousByAddress.get(address);
    if (!nextCell) {
      if (previousCell) {
        operations.push({
          type: "clearRange",
          range: { startRow: row, startCol: renderCol, endRow: row, endCol: renderCol },
        });
      }
      continue;
    }

    const nextValue = normalizeDocumentValue(nextCell);
    const previousValue = previousCell ? normalizeDocumentValue(previousCell) : null;
    if (valueKey(nextValue) === valueKey(previousValue)) continue;
    operations.push({ type: "setCell", row, col: renderCol, value: nextValue });
  }

  const previousMerges = extractMergesFromCelldata(previous)
    .filter((merge) => !isRendererHeaderRow(merge.row[0], headerRows))
    .map((merge) => ({
      startRow: rendererRowToDocumentRow(merge.row[0], headerRows),
      startCol: merge.col[0],
      endRow: rendererRowToDocumentRow(merge.row[1], headerRows),
      endCol: merge.col[1],
    }));
  const nextMerges = extractMergesFromCelldata(next)
    .filter((merge) => !isRendererHeaderRow(merge.row[0], headerRows))
    .map((merge) => ({
      startRow: rendererRowToDocumentRow(merge.row[0], headerRows),
      startCol: merge.col[0],
      endRow: rendererRowToDocumentRow(merge.row[1], headerRows),
      endCol: merge.col[1],
    }));
  const mergeId = (merge: (typeof nextMerges)[number]) =>
    `merge:${merge.startRow}:${merge.startCol}:${merge.endRow}:${merge.endCol}`;
  const previousMergeIds = new Set(previousMerges.map(mergeId));
  const nextMergeIds = new Set(nextMerges.map(mergeId));

  for (const merge of nextMerges) {
    if (previousMergeIds.has(mergeId(merge))) continue;
    operations.push({
      type: "createObject",
      object: { id: mergeId(merge), type: "custom", position: merge, data: { kind: "merge" } },
    });
  }
  for (const merge of previousMerges) {
    if (nextMergeIds.has(mergeId(merge))) continue;
    operations.push({ type: "deleteObject", id: mergeId(merge) });
  }

  return coalesceDocumentOperations(operations);
}
