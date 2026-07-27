export type SheetIdentity = string | number;

export function normalizeSheetId(sheetId: SheetIdentity): string {
  return String(sheetId);
}

export function findSheetIndexById<T extends { id: SheetIdentity }>(
  sheets: readonly T[],
  sheetId: SheetIdentity,
): number {
  const normalizedSheetId = normalizeSheetId(sheetId);
  return sheets.findIndex((sheet) => normalizeSheetId(sheet.id) === normalizedSheetId);
}
