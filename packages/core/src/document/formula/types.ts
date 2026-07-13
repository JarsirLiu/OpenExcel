import type { CellRange, DocumentCell, DocumentScalar } from "../model.js";

export interface CalculationSheetInput {
  name: string;
  cells: DocumentCell[];
  formulaAsts?: Record<string, FormulaAst>;
}

export interface CalculationCellInput {
  sheetName: string;
  row: number;
  col: number;
  value: DocumentScalar;
  formula?: string;
  ast?: FormulaAst;
}

export interface CalculationCellResult {
  sheetName: string;
  row: number;
  col: number;
  value: DocumentScalar;
  formula?: string;
  error?: string;
}

export type FormulaError = { error: string };
export type FormulaValue = DocumentScalar | FormulaValue[] | FormulaError;

export type FormulaReferenceNode = {
  type: "reference";
  sheetName?: string;
  range: CellRange;
};

export type FormulaAst =
  | { type: "literal"; value: DocumentScalar }
  | FormulaReferenceNode
  | { type: "unary"; operator: "+" | "-"; operand: FormulaAst }
  | {
      type: "binary";
      operator: "+" | "-" | "*" | "/" | "^" | "&" | "=" | "<>" | ">" | "<" | ">=" | "<=";
      left: FormulaAst;
      right: FormulaAst;
    }
  | { type: "function"; name: string; args: FormulaAst[] };
