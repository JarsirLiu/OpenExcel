import { formatA1Cell } from "../range.js";
import { evaluateAst } from "./evaluator.js";
import { FormulaParseError, normalizeFormula, parseFormula } from "./parser.js";
import { toResult } from "./result.js";
import type {
  CalculationCellInput,
  CalculationCellResult,
  CalculationSheetInput,
  FormulaAst,
  FormulaReferenceNode,
  FormulaValue,
} from "./types.js";

function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

function resultKey(sheetName: string, row: number, col: number): string {
  return `${sheetName}:${cellKey(row, col)}`;
}

export class FormulaCalculationEngine {
  private readonly sheets = new Map<string, Map<string, CalculationCellInput>>();
  private readonly formulaCells = new Map<string, CalculationCellInput>();
  private readonly resultCache = new Map<string, CalculationCellResult>();
  private readonly astCache = new Map<string, FormulaAst>();

  constructor(sheets: CalculationSheetInput[]) {
    for (const sheet of sheets) {
      if (this.sheets.has(sheet.name))
        throw new Error(`Duplicate calculation sheet name: ${sheet.name}`);
      const cells = new Map<string, CalculationCellInput>();
      this.sheets.set(sheet.name, cells);
      for (const cell of sheet.cells) {
        const input = {
          sheetName: sheet.name,
          row: cell.row,
          col: cell.col,
          value: cell.value.value,
          formula: cell.value.formula,
          ast: sheet.formulaAsts?.[formatA1Cell(cell.row, cell.col)],
        } satisfies CalculationCellInput;
        cells.set(cellKey(cell.row, cell.col), input);
        if (input.formula) this.formulaCells.set(resultKey(sheet.name, cell.row, cell.col), input);
      }
    }
    this.refreshFormulaResults();
  }

  private readCell(sheetName: string, row: number, col: number, stack: Set<string>): FormulaValue {
    const sheet = this.sheets.get(sheetName);
    if (!sheet) return { error: "REF" };
    const cell = sheet.get(cellKey(row, col));
    if (!cell) return null;
    if (!cell.formula) return cell.value;
    const key = resultKey(sheetName, row, col);
    if (stack.has(key)) return { error: "CYCLE" };
    stack.add(key);
    const value = this.evaluateFormula(cell.formula, sheetName, row, col, stack, cell.ast);
    stack.delete(key);
    return value;
  }

  private readReference(
    reference: FormulaReferenceNode,
    currentSheet: string,
    stack: Set<string>,
  ): FormulaValue {
    const sheetName = reference.sheetName ?? currentSheet;
    const values: FormulaValue[] = [];
    for (let row = reference.range.startRow; row <= reference.range.endRow; row += 1) {
      for (let col = reference.range.startCol; col <= reference.range.endCol; col += 1) {
        values.push(this.readCell(sheetName, row, col, stack));
      }
    }
    return values;
  }

  private evaluateFormula(
    formula: string,
    sheetName: string,
    row: number,
    col: number,
    stack: Set<string>,
    providedAst?: FormulaAst,
  ): FormulaValue {
    try {
      const normalizedFormula = normalizeFormula(formula);
      const ast =
        providedAst ?? this.astCache.get(normalizedFormula) ?? parseFormula(normalizedFormula);
      this.astCache.set(normalizedFormula, ast);
      return evaluateAst(
        ast,
        {
          readCell: (referenceSheet, referenceRow, referenceCol) =>
            this.readCell(referenceSheet, referenceRow, referenceCol, stack),
          readReference: (reference) => this.readReference(reference, sheetName, stack),
        },
        sheetName,
      );
    } catch (error) {
      return { error: error instanceof FormulaParseError ? "PARSE_ERROR" : "VALUE" };
    }
  }

  private refreshFormulaResults(): void {
    this.resultCache.clear();
    for (const input of this.formulaCells.values()) {
      const value = this.readCell(input.sheetName, input.row, input.col, new Set());
      this.resultCache.set(
        resultKey(input.sheetName, input.row, input.col),
        toResult(input, value),
      );
    }
  }

  applyCells(inputs: CalculationCellInput[]): CalculationCellResult[] {
    const previous = new Map(this.resultCache);
    const changed: CalculationCellResult[] = [];
    for (const input of inputs) {
      const sheet = this.sheets.get(input.sheetName);
      if (!sheet) throw new Error(`Calculation sheet not found: ${input.sheetName}`);
      const key = resultKey(input.sheetName, input.row, input.col);
      const next = {
        ...input,
        formula: input.formula ? normalizeFormula(input.formula) : undefined,
      };
      sheet.set(cellKey(input.row, input.col), next);
      if (next.formula) this.formulaCells.set(key, next);
      else this.formulaCells.delete(key);
      if (!next.formula) changed.push(toResult(next, next.value));
    }
    this.refreshFormulaResults();
    for (const input of this.formulaCells.values()) {
      const key = resultKey(input.sheetName, input.row, input.col);
      const next = this.resultCache.get(key);
      if (next && JSON.stringify(previous.get(key)) !== JSON.stringify(next)) changed.push(next);
    }
    return changed;
  }

  calculateFormula(sheetName: string, row: number, col: number): CalculationCellResult {
    const sheet = this.sheets.get(sheetName);
    if (!sheet) throw new Error(`Calculation sheet not found: ${sheetName}`);
    const input: CalculationCellInput = sheet.get(cellKey(row, col)) ?? {
      sheetName,
      row,
      col,
      value: null,
    };
    return toResult(input, this.readCell(sheetName, row, col, new Set()));
  }

  calculateAllFormulas(): CalculationCellResult[] {
    return [...this.formulaCells.values()].map((input) =>
      this.calculateFormula(input.sheetName, input.row, input.col),
    );
  }

  getSheetNames(): string[] {
    return [...this.sheets.keys()];
  }

  destroy(): void {
    this.sheets.clear();
    this.formulaCells.clear();
    this.resultCache.clear();
    this.astCache.clear();
  }
}
