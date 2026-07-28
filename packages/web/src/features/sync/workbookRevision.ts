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

function shouldKeepCurrentSheet(
  current: WorkbookFull["sheets"][number],
  next: WorkbookFull["sheets"][number],
): boolean {
  if (current.revision > next.revision) return true;
  return current.loaded !== false && next.loaded === false;
}

/**
 * Merges a server snapshot without allowing an older Sheet payload to replace
 * a newer local delta. Charts are a separate workbook resource and always
 * come from the latest accepted snapshot.
 */
export function mergeWorkbookSnapshot(current: WorkbookFull, next: WorkbookFull): WorkbookFull {
  if (current.id !== next.id) return next;

  const currentSheets = new Map(current.sheets.map((sheet) => [sheet.id, sheet]));
  return {
    ...next,
    sheets: next.sheets.map((sheet) => {
      const previous = currentSheets.get(sheet.id);
      return previous && shouldKeepCurrentSheet(previous, sheet) ? previous : sheet;
    }),
    charts: next.charts,
  };
}
