import type { WorkbookFull } from "@/api/workbooks";

/** Returns true when a same-workbook snapshot is older for any existing Sheet. */
export function isWorkbookSnapshotStale(current: WorkbookFull, next: WorkbookFull): boolean {
  if (current.id !== next.id) return false;

  const nextSheets = new Map(next.sheets.map((sheet) => [sheet.id, sheet.revision]));
  return current.sheets.some((sheet) => {
    const nextRevision = nextSheets.get(sheet.id);
    return nextRevision != null && nextRevision < sheet.revision;
  });
}
