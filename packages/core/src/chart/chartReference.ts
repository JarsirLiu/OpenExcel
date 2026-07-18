import type { CellAddress, RangeReference } from "./chartModel.js";

function columnName(column: number): string {
  let value = column + 1;
  let name = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }

  return name;
}

function quoteSheetName(sheetName: string): string {
  return `'${sheetName.split("'").join("''")}'`;
}

export function cellAddressToA1(address: CellAddress, absolute = false): string {
  const column = columnName(address.col);
  const row = address.row + 1;
  return absolute ? `$${column}$${row}` : `${column}${row}`;
}

export function rangeReferenceToA1(reference: RangeReference, sheetName: string): string {
  const start = cellAddressToA1(reference.start, true);
  const end = cellAddressToA1(reference.end, true);
  const sheet = quoteSheetName(sheetName);
  return `${sheet}!${start}:${end}`;
}
