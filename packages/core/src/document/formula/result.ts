import type { DocumentScalar } from "../model.js";
import { isFormulaError } from "./runtime.js";
import type { CalculationCellInput, CalculationCellResult, FormulaValue } from "./types.js";

function toScalar(value: FormulaValue): DocumentScalar {
  if (isFormulaError(value)) return null;
  if (Array.isArray(value)) return toScalar(value[0] ?? null);
  return value;
}

export function toResult(input: CalculationCellInput, value: FormulaValue): CalculationCellResult {
  if (isFormulaError(value)) {
    return {
      sheetName: input.sheetName,
      row: input.row,
      col: input.col,
      value: null,
      formula: input.formula,
      error: value.error,
    };
  }
  return {
    sheetName: input.sheetName,
    row: input.row,
    col: input.col,
    value: toScalar(value),
    formula: input.formula,
  };
}
