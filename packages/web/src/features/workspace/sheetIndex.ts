export function normalizeSheetIndex(index: number, sheetCount: number): number {
  if (sheetCount <= 0 || !Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(Math.trunc(index), sheetCount - 1));
}

export function getSheetIndexAfterDeletion(
  deletedOrder: number,
  remainingSheetCount: number,
): number {
  return normalizeSheetIndex(deletedOrder, remainingSheetCount);
}
