import {
  type CellRange,
  type DocumentCell,
  type DocumentScalar,
  parseA1Cell,
} from "@openexcel/core";

export interface CalculationSheetInput {
  name: string;
  cells: DocumentCell[];
}

export interface CalculationCellInput {
  sheetName: string;
  row: number;
  col: number;
  value: DocumentScalar;
  formula?: string;
}

export interface CalculationCellResult {
  sheetName: string;
  row: number;
  col: number;
  value: DocumentScalar;
  formula?: string;
  error?: string;
}

type FormulaError = { error: string };
type FormulaValue = DocumentScalar | FormulaValue[] | FormulaError;

type Token = {
  kind: "number" | "string" | "identifier" | "operator" | "punctuation";
  text: string;
};

type ReferenceValue = {
  sheetName?: string;
  range: CellRange;
};

class FormulaParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormulaParseError";
  }
}

function normalizeFormula(formula: string): string {
  return formula.trim().replace(/^=/, "");
}

function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

function resultKey(sheetName: string, row: number, col: number): string {
  return `${sheetName}:${cellKey(row, col)}`;
}

function isFormulaError(value: FormulaValue): value is FormulaError {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "error" in value;
}

function flatten(value: FormulaValue): FormulaValue[] {
  return Array.isArray(value) ? value.flatMap(flatten) : [value];
}

function firstError(values: FormulaValue[]): FormulaError | null {
  return values.find(isFormulaError) ?? null;
}

function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let index = formula.startsWith("=") ? 1 : 0;
  while (index < formula.length) {
    const current = formula[index];
    if (!current) break;
    if (/\s/.test(current)) {
      index += 1;
      continue;
    }
    if (/[0-9.]/.test(current)) {
      const start = index;
      index += 1;
      while (index < formula.length && /[0-9.]/.test(formula[index] ?? "")) index += 1;
      tokens.push({ kind: "number", text: formula.slice(start, index) });
      continue;
    }
    if (current === '"') {
      index += 1;
      let value = "";
      while (index < formula.length) {
        if (formula[index] === '"' && formula[index + 1] === '"') {
          value += '"';
          index += 2;
          continue;
        }
        if (formula[index] === '"') break;
        value += formula[index] ?? "";
        index += 1;
      }
      if (formula[index] !== '"') throw new FormulaParseError("Unterminated string");
      index += 1;
      tokens.push({ kind: "string", text: value });
      continue;
    }
    if (current === "'") {
      index += 1;
      let value = "";
      while (index < formula.length) {
        if (formula[index] === "'" && formula[index + 1] === "'") {
          value += "'";
          index += 2;
          continue;
        }
        if (formula[index] === "'") break;
        value += formula[index] ?? "";
        index += 1;
      }
      if (formula[index] !== "'") throw new FormulaParseError("Unterminated sheet name");
      index += 1;
      tokens.push({ kind: "identifier", text: value });
      continue;
    }
    if (/[A-Za-z_]/.test(current)) {
      const start = index;
      index += 1;
      while (index < formula.length && /[A-Za-z0-9_.]/.test(formula[index] ?? "")) index += 1;
      tokens.push({ kind: "identifier", text: formula.slice(start, index) });
      continue;
    }
    const twoCharacterOperator = formula.slice(index, index + 2);
    if ([">=", "<=", "<>"].includes(twoCharacterOperator)) {
      tokens.push({ kind: "operator", text: twoCharacterOperator });
      index += 2;
      continue;
    }
    if ("+-*/^&=<>".includes(current)) {
      tokens.push({ kind: "operator", text: current });
      index += 1;
      continue;
    }
    if ("(),!:".includes(current)) {
      tokens.push({ kind: "punctuation", text: current });
      index += 1;
      continue;
    }
    throw new FormulaParseError(`Unexpected character: ${current}`);
  }
  return tokens;
}

function toNumber(value: FormulaValue): number | FormulaError {
  if (isFormulaError(value)) return value;
  if (Array.isArray(value)) return toNumber(value[0] ?? null);
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === null || value === "") return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : { error: "VALUE" };
}

function toBoolean(value: FormulaValue): boolean | FormulaError {
  if (isFormulaError(value)) return value;
  if (Array.isArray(value)) return toBoolean(value[0] ?? null);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (value === null || value === "") return false;
  return value.toUpperCase() === "TRUE" || value !== "0";
}

class FormulaParser {
  private index = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly readReference: (reference: ReferenceValue) => FormulaValue,
    private readonly readCell: (
      sheetName: string | undefined,
      row: number,
      col: number,
    ) => FormulaValue,
  ) {}

  parse(): FormulaValue {
    const value = this.parseComparison();
    if (this.peek()) throw new FormulaParseError(`Unexpected token: ${this.peek()?.text}`);
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private take(): Token {
    const token = this.peek();
    if (!token) throw new FormulaParseError("Unexpected end of formula");
    this.index += 1;
    return token;
  }

  private match(text: string): boolean {
    if (this.peek()?.text !== text) return false;
    this.index += 1;
    return true;
  }

  private parseComparison(): FormulaValue {
    let left = this.parseAdditive();
    while (["=", "<>", ">", "<", ">=", "<="].includes(this.peek()?.text ?? "")) {
      const operator = this.take().text;
      const right = this.parseAdditive();
      const error = firstError([left, right]);
      if (error) return error;
      const leftValue = Array.isArray(left) ? left[0] : left;
      const rightValue = Array.isArray(right) ? right[0] : right;
      const equal = String(leftValue) === String(rightValue);
      left =
        operator === "="
          ? equal
          : operator === "<>"
            ? !equal
            : operator === ">"
              ? Number(leftValue) > Number(rightValue)
              : operator === "<"
                ? Number(leftValue) < Number(rightValue)
                : operator === ">="
                  ? Number(leftValue) >= Number(rightValue)
                  : Number(leftValue) <= Number(rightValue);
    }
    return left;
  }

  private parseAdditive(): FormulaValue {
    let left = this.parseMultiplicative();
    while (["+", "-", "&"].includes(this.peek()?.text ?? "")) {
      const operator = this.take().text;
      const right = this.parseMultiplicative();
      const error = firstError([left, right]);
      if (error) return error;
      if (operator === "&") {
        left = `${left}${right}`;
        continue;
      }
      const leftNumber = toNumber(left);
      const rightNumber = toNumber(right);
      if (typeof leftNumber !== "number") return leftNumber;
      if (typeof rightNumber !== "number") return rightNumber;
      left = operator === "+" ? leftNumber + rightNumber : leftNumber - rightNumber;
    }
    return left;
  }

  private parseMultiplicative(): FormulaValue {
    let left = this.parsePower();
    while (["*", "/"].includes(this.peek()?.text ?? "")) {
      const operator = this.take().text;
      const right = this.parsePower();
      const error = firstError([left, right]);
      if (error) return error;
      const leftNumber = toNumber(left);
      const rightNumber = toNumber(right);
      if (typeof leftNumber !== "number") return leftNumber;
      if (typeof rightNumber !== "number") return rightNumber;
      if (operator === "/" && rightNumber === 0) return { error: "DIV_BY_ZERO" };
      left = operator === "*" ? leftNumber * rightNumber : leftNumber / rightNumber;
    }
    return left;
  }

  private parsePower(): FormulaValue {
    const left = this.parseUnary();
    if (!this.match("^")) return left;
    const right = this.parsePower();
    const error = firstError([left, right]);
    if (error) return error;
    const leftNumber = toNumber(left);
    const rightNumber = toNumber(right);
    if (typeof leftNumber !== "number") return leftNumber;
    if (typeof rightNumber !== "number") return rightNumber;
    return leftNumber ** rightNumber;
  }

  private parseUnary(): FormulaValue {
    if (this.match("+")) return toNumber(this.parseUnary());
    if (this.match("-")) {
      const value = toNumber(this.parseUnary());
      return typeof value === "number" ? -value : value;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): FormulaValue {
    if (this.match("(")) {
      const value = this.parseComparison();
      if (!this.match(")")) throw new FormulaParseError("Missing closing parenthesis");
      return value;
    }
    const token = this.take();
    if (token.kind === "number") {
      const value = Number(token.text);
      if (!Number.isFinite(value)) throw new FormulaParseError("Invalid number");
      return value;
    }
    if (token.kind === "string") return token.text;
    if (token.kind !== "identifier") throw new FormulaParseError(`Unexpected token: ${token.text}`);
    if (this.match("(")) return this.parseFunction(token.text);
    if (token.text.toUpperCase() === "TRUE") return true;
    if (token.text.toUpperCase() === "FALSE") return false;
    return this.parseReference(token.text);
  }

  private parseFunction(name: string): FormulaValue {
    const args: FormulaValue[] = [];
    if (!this.match(")")) {
      do {
        args.push(this.parseComparison());
      } while (this.match(","));
      if (!this.match(")")) throw new FormulaParseError("Missing function closing parenthesis");
    }
    const error = firstError(args);
    if (error && !["IF", "AND", "OR"].includes(name.toUpperCase())) return error;
    return this.evaluateFunction(name.toUpperCase(), args);
  }

  private evaluateFunction(name: string, args: FormulaValue[]): FormulaValue {
    const values = flatten(args.flatMap((arg) => (name === "IF" ? [arg] : flatten(arg))));
    switch (name) {
      case "SUM": {
        const numbers = values.map(toNumber);
        const error = firstError(numbers);
        if (error) return error;
        return numbers.reduce<number>(
          (sum, value) => (typeof value === "number" ? sum + value : sum),
          0,
        );
      }
      case "AVERAGE": {
        const numbers = values.map(toNumber);
        const error = firstError(numbers);
        return (
          error ?? (numbers as number[]).reduce((sum, value) => sum + value, 0) / numbers.length
        );
      }
      case "MIN":
      case "MAX": {
        const numbers = values.map(toNumber);
        const error = firstError(numbers);
        if (error) return error;
        return name === "MIN"
          ? Math.min(...(numbers as number[]))
          : Math.max(...(numbers as number[]));
      }
      case "COUNT":
        return values.filter((value) => typeof value === "number").length;
      case "COUNTA":
        return values.filter((value) => value !== null && value !== "").length;
      case "IF": {
        const condition = toBoolean(args[0] ?? false);
        if (typeof condition !== "boolean") return condition;
        return condition ? (args[1] ?? true) : (args[2] ?? false);
      }
      case "AND": {
        const booleans = values.map(toBoolean);
        const error = firstError(booleans);
        return error ?? (booleans as boolean[]).every(Boolean);
      }
      case "OR": {
        const booleans = values.map(toBoolean);
        const error = firstError(booleans);
        return error ?? (booleans as boolean[]).some(Boolean);
      }
      case "NOT": {
        const value = toBoolean(args[0] ?? false);
        return typeof value === "boolean" ? !value : value;
      }
      case "ABS": {
        const value = toNumber(args[0] ?? 0);
        return typeof value === "number" ? Math.abs(value) : value;
      }
      case "ROUND": {
        const value = toNumber(args[0] ?? 0);
        const digits = toNumber(args[1] ?? 0);
        if (typeof value !== "number") return value;
        if (typeof digits !== "number") return digits;
        const factor = 10 ** digits;
        return Math.round(value * factor) / factor;
      }
      case "CONCATENATE":
        return values.map((value) => String(value ?? "")).join("");
      default:
        return { error: "NAME" };
    }
  }

  private parseReference(first: string): FormulaValue {
    let sheetName: string | undefined;
    let reference = first;
    if (this.match("!")) {
      sheetName = first;
      reference = this.take().text;
    }
    let start: { row: number; col: number };
    try {
      start = parseA1Cell(reference);
    } catch {
      throw new FormulaParseError(`Invalid reference: ${reference}`);
    }
    let end = start;
    if (this.match(":")) {
      const endReference = this.take().text;
      try {
        end = parseA1Cell(endReference);
      } catch {
        throw new FormulaParseError(`Invalid range: ${endReference}`);
      }
    }
    const range = {
      startRow: Math.min(start.row, end.row),
      startCol: Math.min(start.col, end.col),
      endRow: Math.max(start.row, end.row),
      endCol: Math.max(start.col, end.col),
    };
    if (range.startRow === range.endRow && range.startCol === range.endCol) {
      return this.readCell(sheetName, start.row, start.col);
    }
    return this.readReference({ sheetName, range });
  }
}

function toResult(input: CalculationCellInput, value: FormulaValue): CalculationCellResult {
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
  const scalar = toScalar(value);
  return {
    sheetName: input.sheetName,
    row: input.row,
    col: input.col,
    value: scalar,
    formula: input.formula,
  };
}

function toScalar(value: FormulaValue): DocumentScalar {
  if (isFormulaError(value)) return null;
  if (Array.isArray(value)) return toScalar(value[0] ?? null);
  return value;
}

export class FormulaCalculationEngine {
  private readonly sheets = new Map<string, Map<string, CalculationCellInput>>();
  private readonly formulaCells = new Map<string, CalculationCellInput>();
  private readonly resultCache = new Map<string, CalculationCellResult>();

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
    const value = this.evaluateFormula(cell.formula, sheetName, row, col, stack);
    stack.delete(key);
    return value;
  }

  private readReference(
    reference: ReferenceValue,
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
  ): FormulaValue {
    try {
      return new FormulaParser(
        tokenize(formula),
        (reference) => this.readReference(reference, sheetName, stack),
        (referenceSheet, referenceRow, referenceCol) =>
          this.readCell(referenceSheet ?? sheetName, referenceRow, referenceCol, stack),
      ).parse();
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
  }
}
