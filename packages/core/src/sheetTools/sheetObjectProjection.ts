import { cellAddressToA1 } from "../chart/chartReference.js";
import type { FilterSelection, SheetConfig } from "../excel/sheetConfig.js";

export type SheetObjectType = "filters";

export type SheetObjectSource = {
  config: SheetConfig | null;
};

function filterRange(selection: FilterSelection | undefined): string | null {
  if (!selection) return null;
  const start = cellAddressToA1({ row: selection.row[0], col: selection.column[0] });
  const end = cellAddressToA1({ row: selection.row[1], col: selection.column[1] });
  return start === end ? start : `${start}:${end}`;
}

function projectFilters(source: SheetObjectSource) {
  const selection = source.config?.filter_select;
  const range = filterRange(selection);
  return range ? [{ kind: "filter" as const, range }] : [];
}

export function projectSheetObjects(source: SheetObjectSource, objectType: SheetObjectType) {
  if (objectType !== "filters") throw new Error(`Unsupported Sheet object type: ${objectType}`);
  return projectFilters(source);
}
