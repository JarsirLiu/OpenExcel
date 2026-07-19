import { tokenizeFormula } from "./formulaReferenceTokenizer.js";

function referenceToR1C1(
  reference: {
    absoluteColumn: boolean;
    column: number;
    absoluteRow: boolean;
    row: number;
  },
  row: number,
  col: number,
): string {
  const targetRow = reference.row - 1;
  const targetCol = reference.column - 1;
  const rowDelta = targetRow - row;
  const colDelta = targetCol - col;
  const rowPart = reference.absoluteRow
    ? `R${targetRow + 1}`
    : rowDelta === 0
      ? "R"
      : `R[${rowDelta}]`;
  const colPart = reference.absoluteColumn
    ? `C${targetCol + 1}`
    : colDelta === 0
      ? "C"
      : `C[${colDelta}]`;
  return `${rowPart}${colPart}`;
}

export function formulaToR1C1(formula: string, row: number, col: number): string {
  const output = tokenizeFormula(formula)
    .map((token) =>
      token.kind === "reference" ? referenceToR1C1(token.value, row, col) : token.value,
    )
    .join("");
  return `=${output.replace(/^=/, "")}`;
}
