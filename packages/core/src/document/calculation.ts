import type { CellRange, DocumentCell, DocumentScalar } from "./model.js";
import { formatA1Cell, parseA1Cell } from "./range.js";

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

type FormulaError = { error: string };
type FormulaValue = DocumentScalar | FormulaValue[] | FormulaError;

type Token = {
  kind: "number" | "string" | "identifier" | "operator" | "punctuation";
  text: string;
};

type FormulaReferenceNode = {
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

function scalarValue(value: FormulaValue): DocumentScalar | FormulaError {
  if (isFormulaError(value)) return value;
  return Array.isArray(value) ? scalarValue(value[0] ?? null) : value;
}

function valuesEqual(left: DocumentScalar, right: DocumentScalar): boolean {
  if (left === null || left === "") return right === null || right === "";
  if (right === null || right === "") return left === null || left === "";
  if (typeof left === "number" && typeof right === "number") return left === right;
  if (typeof left === "boolean" || typeof right === "boolean") return left === right;
  return String(left).toUpperCase() === String(right).toUpperCase();
}

function compareCriteria(value: FormulaValue, criteria: FormulaValue): boolean | FormulaError {
  const actual = scalarValue(value);
  const expected = scalarValue(criteria);
  if (isFormulaError(actual)) return actual;
  if (isFormulaError(expected)) return expected;

  if (typeof expected !== "string") return valuesEqual(actual, expected);

  const match = expected.match(/^(<=|>=|<>|=|<|>)(.*)$/);
  const operator = match?.[1] ?? "=";
  const operand = match?.[2] ?? expected;
  const numericOperand = Number(operand);
  const numericActual = typeof actual === "number" ? actual : Number(actual);
  const useNumericComparison =
    operand.trim() !== "" && Number.isFinite(numericOperand) && Number.isFinite(numericActual);

  if (operator === "=") {
    if (operand.includes("*") || operand.includes("?")) {
      const pattern = new RegExp(
        `^${operand
          .replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")
          .replace(/\\*/g, ".*")
          .replace(/\\?/g, ".")}$`,
        "i",
      );
      return pattern.test(String(actual ?? ""));
    }
    return valuesEqual(actual, operand);
  }

  if (useNumericComparison) {
    switch (operator) {
      case "<>":
        return numericActual !== numericOperand;
      case "<":
        return numericActual < numericOperand;
      case "<=":
        return numericActual <= numericOperand;
      case ">":
        return numericActual > numericOperand;
      case ">=":
        return numericActual >= numericOperand;
    }
  }

  const left = String(actual ?? "").toUpperCase();
  const right = operand.toUpperCase();
  switch (operator) {
    case "<>":
      return left !== right;
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    default:
      return false;
  }
}

function criteriaRangeValues(value: FormulaValue): FormulaValue[] {
  return Array.isArray(value) ? flatten(value) : [value];
}

function scalarText(value: FormulaValue): string | FormulaError {
  const scalar = scalarValue(value);
  return isFormulaError(scalar) ? scalar : String(scalar ?? "");
}

function roundDecimal(value: number, digits: number, mode: "nearest" | "up" | "down"): number {
  if (!Number.isFinite(value) || !Number.isFinite(digits)) return Number.NaN;
  const factor = 10 ** digits;
  const scaled = value * factor;
  const rounded =
    mode === "up"
      ? Math.ceil(Math.abs(scaled)) * Math.sign(scaled)
      : mode === "down"
        ? Math.floor(Math.abs(scaled)) * Math.sign(scaled)
        : Math.round(scaled);
  return rounded / factor;
}

function numericFunctionArgs(args: FormulaValue[]): number[] | FormulaError {
  const numbers = flatten(args.flatMap((arg) => flatten(arg))).map(toNumber);
  const error = firstError(numbers);
  return error ?? (numbers as number[]);
}

function evaluateIndexValue(
  args: FormulaAst[],
  context: FormulaEvaluationContext,
  currentSheet: string,
): FormulaValue {
  const source = args[0];
  if (source?.type !== "reference") return { error: "VALUE" };
  const values = criteriaRangeValues(evaluateAst(source, context, currentSheet));
  const rows = source.range.endRow - source.range.startRow + 1;
  const columns = source.range.endCol - source.range.startCol + 1;
  if (values.length !== rows * columns) return { error: "REF" };

  const rowNumber = toNumber(
    args[1] ? evaluateAst(args[1], context, currentSheet) : { error: "VALUE" },
  );
  const columnNumber =
    args[2] === undefined ? 1 : toNumber(evaluateAst(args[2], context, currentSheet));
  if (typeof rowNumber !== "number") return rowNumber;
  if (typeof columnNumber !== "number") return columnNumber;
  if (!Number.isInteger(rowNumber) || !Number.isInteger(columnNumber)) return { error: "VALUE" };
  if (rowNumber < 0 || columnNumber < 0 || rowNumber > rows || columnNumber > columns) {
    return { error: "REF" };
  }
  if (rowNumber === 0 && columnNumber === 0) return { error: "VALUE" };
  if (rowNumber === 0) {
    return values.filter((_, index) => index % columns === columnNumber - 1);
  }
  if (columnNumber === 0) {
    const start = (rowNumber - 1) * columns;
    return values.slice(start, start + columns);
  }
  return values[(rowNumber - 1) * columns + columnNumber - 1] ?? { error: "REF" };
}

function validateCriteriaRanges(
  values: FormulaValue[],
  criteriaRanges: FormulaValue[],
): FormulaError | null {
  const expectedLength = values.length;
  return criteriaRanges.every((range) => criteriaRangeValues(range).length === expectedLength)
    ? null
    : { error: "VALUE" };
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
    if (current === "$") {
      index += 1;
      continue;
    }
    if (/[0-9.]/.test(current)) {
      const start = index;
      index += 1;
      while (index < formula.length && /[0-9.]/.test(formula[index] ?? "")) index += 1;
      const numberText = formula.slice(start, index);
      if (formula[index] === "%") {
        index += 1;
        tokens.push({ kind: "number", text: String(Number(numberText) / 100) });
      } else {
        tokens.push({ kind: "number", text: numberText });
      }
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
      while (index < formula.length && /[A-Za-z0-9_.$]/.test(formula[index] ?? "")) index += 1;
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

  constructor(private readonly tokens: Token[]) {}

  parse(): FormulaAst {
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
    const token = this.peek();
    if (!token || token.text !== text || !["operator", "punctuation"].includes(token.kind)) {
      return false;
    }
    this.index += 1;
    return true;
  }

  private parseComparison(): FormulaAst {
    let left = this.parseAdditive();
    while (["=", "<>", ">", "<", ">=", "<="].includes(this.peek()?.text ?? "")) {
      const operator = this.take().text;
      const right = this.parseAdditive();
      left = {
        type: "binary",
        operator: operator as Extract<FormulaAst, { type: "binary" }>["operator"],
        left,
        right,
      };
    }
    return left;
  }

  private parseAdditive(): FormulaAst {
    let left = this.parseMultiplicative();
    while (["+", "-", "&"].includes(this.peek()?.text ?? "")) {
      const operator = this.take().text;
      const right = this.parseMultiplicative();
      left = {
        type: "binary",
        operator: operator as Extract<FormulaAst, { type: "binary" }>["operator"],
        left,
        right,
      };
    }
    return left;
  }

  private parseMultiplicative(): FormulaAst {
    let left = this.parsePower();
    while (["*", "/"].includes(this.peek()?.text ?? "")) {
      const operator = this.take().text;
      const right = this.parsePower();
      left = {
        type: "binary",
        operator: operator as Extract<FormulaAst, { type: "binary" }>["operator"],
        left,
        right,
      };
    }
    return left;
  }

  private parsePower(): FormulaAst {
    const left = this.parseUnary();
    if (!this.match("^")) return left;
    const right = this.parsePower();
    return { type: "binary", operator: "^", left, right };
  }

  private parseUnary(): FormulaAst {
    if (this.match("+")) return { type: "unary", operator: "+", operand: this.parseUnary() };
    if (this.match("-")) return { type: "unary", operator: "-", operand: this.parseUnary() };
    return this.parsePrimary();
  }

  private parsePrimary(): FormulaAst {
    if (this.match("(")) {
      const value = this.parseComparison();
      if (!this.match(")")) throw new FormulaParseError("Missing closing parenthesis");
      return value;
    }
    const token = this.take();
    if (token.kind === "number") {
      const value = Number(token.text);
      if (!Number.isFinite(value)) throw new FormulaParseError("Invalid number");
      return { type: "literal", value };
    }
    if (token.kind === "string") return { type: "literal", value: token.text };
    if (token.kind !== "identifier") throw new FormulaParseError(`Unexpected token: ${token.text}`);
    if (this.match("(")) return this.parseFunction(token.text);
    if (token.text.toUpperCase() === "TRUE") return { type: "literal", value: true };
    if (token.text.toUpperCase() === "FALSE") return { type: "literal", value: false };
    return this.parseReference(token.text);
  }

  private parseFunction(name: string): FormulaAst {
    const args: FormulaAst[] = [];
    if (!this.match(")")) {
      do {
        args.push(this.parseComparison());
      } while (this.match(","));
      if (!this.match(")")) throw new FormulaParseError("Missing function closing parenthesis");
    }
    return { type: "function", name: name.toUpperCase(), args };
  }

  private parseReference(first: string): FormulaAst {
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
    return { type: "reference", sheetName, range };
  }
}

export function parseFormula(formula: string): FormulaAst {
  return new FormulaParser(tokenize(normalizeFormula(formula))).parse();
}

interface FormulaEvaluationContext {
  readCell: (sheetName: string, row: number, col: number) => FormulaValue;
  readReference: (reference: FormulaReferenceNode) => FormulaValue;
}

function evaluateFunction(name: string, args: FormulaValue[]): FormulaValue {
  const values = flatten(args.flatMap((arg) => flatten(arg)));
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
      if (error) return error;
      return numbers.length === 0
        ? { error: "DIV_BY_ZERO" }
        : (numbers as number[]).reduce((sum, value) => sum + value, 0) / numbers.length;
    }
    case "MIN":
    case "MAX": {
      const numbers = values.map(toNumber);
      const error = firstError(numbers);
      if (error) return error;
      if (numbers.length === 0) return 0;
      return name === "MIN"
        ? Math.min(...(numbers as number[]))
        : Math.max(...(numbers as number[]));
    }
    case "PRODUCT": {
      const numbers = numericFunctionArgs(args);
      if (isFormulaError(numbers)) return numbers;
      return numbers.reduce((product, value) => product * value, 1);
    }
    case "SUMPRODUCT": {
      if (args.length === 0) return { error: "VALUE" };
      const ranges = args.map(criteriaRangeValues);
      const length = ranges[0]?.length ?? 0;
      if (length === 0 || ranges.some((range) => range.length !== length)) {
        return { error: "VALUE" };
      }
      let total = 0;
      for (let row = 0; row < length; row += 1) {
        let product = 1;
        for (const range of ranges) {
          const number = toNumber(range[row] ?? null);
          if (typeof number !== "number") return number;
          product *= number;
        }
        total += product;
      }
      return total;
    }
    case "COUNT":
      return values.filter((value) => typeof value === "number").length;
    case "COUNTA":
      return values.filter((value) => value !== null && value !== "").length;
    case "COUNTBLANK":
      return values.filter((value) => {
        const scalar = scalarValue(value);
        return !isFormulaError(scalar) && (scalar === null || scalar === "");
      }).length;
    case "ISNUMBER": {
      const value = scalarValue(args[0] ?? null);
      return !isFormulaError(value) && typeof value === "number";
    }
    case "ISTEXT": {
      const value = scalarValue(args[0] ?? null);
      return !isFormulaError(value) && typeof value === "string";
    }
    case "ISBLANK": {
      const value = scalarValue(args[0] ?? null);
      return !isFormulaError(value) && (value === null || value === "");
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
      return roundDecimal(value, digits, "nearest");
    }
    case "ROUNDUP":
    case "ROUNDDOWN": {
      const value = toNumber(args[0] ?? 0);
      const digits = toNumber(args[1] ?? 0);
      if (typeof value !== "number") return value;
      if (typeof digits !== "number") return digits;
      return roundDecimal(value, digits, name === "ROUNDUP" ? "up" : "down");
    }
    case "INT": {
      const value = toNumber(args[0] ?? 0);
      return typeof value === "number" ? Math.floor(value) : value;
    }
    case "MOD": {
      const dividend = toNumber(args[0] ?? 0);
      const divisor = toNumber(args[1] ?? 0);
      if (typeof dividend !== "number") return dividend;
      if (typeof divisor !== "number") return divisor;
      if (divisor === 0) return { error: "DIV_BY_ZERO" };
      return dividend - divisor * Math.floor(dividend / divisor);
    }
    case "CONCATENATE":
      return values.map((value) => String(value ?? "")).join("");
    case "LEN": {
      const value = scalarText(args[0] ?? null);
      return typeof value === "string" ? value.length : value;
    }
    case "LEFT":
    case "RIGHT": {
      const value = scalarText(args[0] ?? null);
      const count = toNumber(args[1] ?? 1);
      if (typeof value !== "string") return value;
      if (typeof count !== "number" || !Number.isInteger(count) || count < 0)
        return { error: "VALUE" };
      return name === "LEFT" ? value.slice(0, count) : count === 0 ? "" : value.slice(-count);
    }
    case "MID": {
      const value = scalarText(args[0] ?? null);
      const start = toNumber(args[1] ?? 0);
      const count = toNumber(args[2] ?? 0);
      if (typeof value !== "string") return value;
      if (
        typeof start !== "number" ||
        typeof count !== "number" ||
        !Number.isInteger(start) ||
        !Number.isInteger(count) ||
        start < 1 ||
        count < 0
      ) {
        return { error: "VALUE" };
      }
      return value.slice(start - 1, start - 1 + count);
    }
    case "TRIM": {
      const value = scalarText(args[0] ?? null);
      return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value;
    }
    case "UPPER":
    case "LOWER": {
      const value = scalarText(args[0] ?? null);
      if (typeof value !== "string") return value;
      return name === "UPPER" ? value.toUpperCase() : value.toLowerCase();
    }
    case "FIND":
    case "SEARCH": {
      const needle = scalarText(args[0] ?? null);
      const haystack = scalarText(args[1] ?? null);
      const start = toNumber(args[2] ?? 1);
      if (typeof needle !== "string") return needle;
      if (typeof haystack !== "string") return haystack;
      if (typeof start !== "number" || !Number.isInteger(start) || start < 1) {
        return { error: "VALUE" };
      }
      const index =
        name === "SEARCH"
          ? haystack.toUpperCase().indexOf(needle.toUpperCase(), start - 1)
          : haystack.indexOf(needle, start - 1);
      return index < 0 ? { error: "VALUE" } : index + 1;
    }
    case "SUBSTITUTE": {
      const source = scalarText(args[0] ?? null);
      const oldText = scalarText(args[1] ?? null);
      const newText = scalarText(args[2] ?? null);
      if (typeof source !== "string") return source;
      if (typeof oldText !== "string") return oldText;
      if (typeof newText !== "string") return newText;
      if (args[3] === undefined) return source.split(oldText).join(newText);
      const instance = toNumber(args[3]);
      if (typeof instance !== "number" || !Number.isInteger(instance) || instance < 1) {
        return { error: "VALUE" };
      }
      const parts = source.split(oldText);
      if (instance >= parts.length) return source;
      return `${parts.slice(0, instance).join(oldText)}${newText}${parts
        .slice(instance)
        .join(oldText)}`;
    }
    case "SUMIF": {
      const criteriaValues = criteriaRangeValues(args[0] ?? null);
      const criteria = args[1] ?? null;
      const sumValues = criteriaRangeValues(args[2] ?? args[0] ?? null);
      const lengthError = validateCriteriaRanges(sumValues, [criteriaValues]);
      if (lengthError) return lengthError;
      let total = 0;
      for (let index = 0; index < criteriaValues.length; index += 1) {
        const matches = compareCriteria(criteriaValues[index] ?? null, criteria);
        if (typeof matches !== "boolean") return matches;
        if (!matches) continue;
        const number = toNumber(sumValues[index] ?? null);
        if (typeof number !== "number") return number;
        total += number;
      }
      return total;
    }
    case "SUMIFS": {
      if (args.length < 3 || args.length % 2 === 0) return { error: "VALUE" };
      const sumValues = criteriaRangeValues(args[0] ?? null);
      const criteriaRanges: FormulaValue[][] = [];
      const criteriaValues: FormulaValue[] = [];
      for (let index = 1; index < args.length; index += 2) {
        criteriaRanges.push(criteriaRangeValues(args[index] ?? null));
        criteriaValues.push(args[index + 1] ?? null);
      }
      const lengthError = validateCriteriaRanges(sumValues, criteriaRanges);
      if (lengthError) return lengthError;
      let total = 0;
      for (let row = 0; row < sumValues.length; row += 1) {
        let matches = true;
        for (let criteriaIndex = 0; criteriaIndex < criteriaRanges.length; criteriaIndex += 1) {
          const match = compareCriteria(
            criteriaRanges[criteriaIndex]?.[row] ?? null,
            criteriaValues[criteriaIndex] ?? null,
          );
          if (typeof match !== "boolean") return match;
          if (!match) {
            matches = false;
            break;
          }
        }
        if (!matches) continue;
        const number = toNumber(sumValues[row] ?? null);
        if (typeof number !== "number") return number;
        total += number;
      }
      return total;
    }
    case "AVERAGEIF": {
      const criteriaValues = criteriaRangeValues(args[0] ?? null);
      const criteria = args[1] ?? null;
      const averageValues = criteriaRangeValues(args[2] ?? args[0] ?? null);
      const lengthError = validateCriteriaRanges(averageValues, [criteriaValues]);
      if (lengthError) return lengthError;
      const numbers: number[] = [];
      for (let index = 0; index < criteriaValues.length; index += 1) {
        const matches = compareCriteria(criteriaValues[index] ?? null, criteria);
        if (typeof matches !== "boolean") return matches;
        if (!matches) continue;
        const value = scalarValue(averageValues[index] ?? null);
        if (isFormulaError(value)) return value;
        if (typeof value === "number") numbers.push(value);
      }
      return numbers.length === 0
        ? { error: "DIV_BY_ZERO" }
        : numbers.reduce((a, b) => a + b, 0) / numbers.length;
    }
    case "AVERAGEIFS": {
      if (args.length < 3 || args.length % 2 === 0) return { error: "VALUE" };
      const averageValues = criteriaRangeValues(args[0] ?? null);
      const criteriaRanges: FormulaValue[][] = [];
      const criteriaValues: FormulaValue[] = [];
      for (let index = 1; index < args.length; index += 2) {
        criteriaRanges.push(criteriaRangeValues(args[index] ?? null));
        criteriaValues.push(args[index + 1] ?? null);
      }
      const lengthError = validateCriteriaRanges(averageValues, criteriaRanges);
      if (lengthError) return lengthError;
      const numbers: number[] = [];
      for (let row = 0; row < averageValues.length; row += 1) {
        let matches = true;
        for (let criteriaIndex = 0; criteriaIndex < criteriaRanges.length; criteriaIndex += 1) {
          const match = compareCriteria(
            criteriaRanges[criteriaIndex]?.[row] ?? null,
            criteriaValues[criteriaIndex] ?? null,
          );
          if (typeof match !== "boolean") return match;
          if (!match) {
            matches = false;
            break;
          }
        }
        if (!matches) continue;
        const value = scalarValue(averageValues[row] ?? null);
        if (isFormulaError(value)) return value;
        if (typeof value === "number") numbers.push(value);
      }
      return numbers.length === 0
        ? { error: "DIV_BY_ZERO" }
        : numbers.reduce((a, b) => a + b, 0) / numbers.length;
    }
    case "MAXIFS":
    case "MINIFS": {
      if (args.length < 3 || args.length % 2 === 0) return { error: "VALUE" };
      const targetValues = criteriaRangeValues(args[0] ?? null);
      const criteriaRanges: FormulaValue[][] = [];
      const criteriaValues: FormulaValue[] = [];
      for (let index = 1; index < args.length; index += 2) {
        criteriaRanges.push(criteriaRangeValues(args[index] ?? null));
        criteriaValues.push(args[index + 1] ?? null);
      }
      const lengthError = validateCriteriaRanges(targetValues, criteriaRanges);
      if (lengthError) return lengthError;
      const numbers: number[] = [];
      for (let row = 0; row < targetValues.length; row += 1) {
        let matches = true;
        for (let criteriaIndex = 0; criteriaIndex < criteriaRanges.length; criteriaIndex += 1) {
          const match = compareCriteria(
            criteriaRanges[criteriaIndex]?.[row] ?? null,
            criteriaValues[criteriaIndex] ?? null,
          );
          if (typeof match !== "boolean") return match;
          if (!match) {
            matches = false;
            break;
          }
        }
        if (!matches) continue;
        const value = scalarValue(targetValues[row] ?? null);
        if (isFormulaError(value)) return value;
        if (typeof value === "number") numbers.push(value);
      }
      if (numbers.length === 0) return 0;
      return name === "MAXIFS" ? Math.max(...numbers) : Math.min(...numbers);
    }
    case "COUNTIF": {
      const criteriaValues = criteriaRangeValues(args[0] ?? null);
      const criteria = args[1] ?? null;
      let count = 0;
      for (const value of criteriaValues) {
        const matches = compareCriteria(value, criteria);
        if (typeof matches !== "boolean") return matches;
        if (matches) count += 1;
      }
      return count;
    }
    case "COUNTIFS": {
      if (args.length < 2 || args.length % 2 !== 0) return { error: "VALUE" };
      const criteriaRanges: FormulaValue[][] = [];
      const criteriaValues: FormulaValue[] = [];
      for (let index = 0; index < args.length; index += 2) {
        criteriaRanges.push(criteriaRangeValues(args[index] ?? null));
        criteriaValues.push(args[index + 1] ?? null);
      }
      const firstRange = criteriaRanges[0] ?? [];
      const lengthError = validateCriteriaRanges(firstRange, criteriaRanges);
      if (lengthError) return lengthError;
      let count = 0;
      for (let row = 0; row < firstRange.length; row += 1) {
        let matches = true;
        for (let criteriaIndex = 0; criteriaIndex < criteriaRanges.length; criteriaIndex += 1) {
          const match = compareCriteria(
            criteriaRanges[criteriaIndex]?.[row] ?? null,
            criteriaValues[criteriaIndex] ?? null,
          );
          if (typeof match !== "boolean") return match;
          if (!match) {
            matches = false;
            break;
          }
        }
        if (matches) count += 1;
      }
      return count;
    }
    case "MATCH": {
      const lookupValue = args[0] ?? null;
      const lookupValues = criteriaRangeValues(args[1] ?? null);
      const matchType = toNumber(args[2] ?? 0);
      if (typeof matchType !== "number") return matchType;
      if (![1, 0, -1].includes(matchType)) return { error: "NA" };
      let approximateIndex = -1;
      for (let index = 0; index < lookupValues.length; index += 1) {
        const matches = compareCriteria(lookupValues[index] ?? null, lookupValue);
        if (typeof matches !== "boolean") return matches;
        if (matches) return index + 1;
        if (matchType !== 0) {
          const order = compareLookupOrder(lookupValues[index] ?? null, lookupValue);
          if (typeof order !== "number") return order;
          if ((matchType === 1 && order <= 0) || (matchType === -1 && order >= 0)) {
            approximateIndex = index;
          }
        }
      }
      return approximateIndex >= 0 ? approximateIndex + 1 : { error: "NA" };
    }
    case "LOOKUP": {
      if (args.length < 2) return { error: "VALUE" };
      const lookupValue = scalarValue(args[0] ?? null);
      const lookupValues = criteriaRangeValues(args[1] ?? null);
      const resultValues = criteriaRangeValues(args[2] ?? args[1] ?? null);
      if (lookupValues.length !== resultValues.length) return { error: "VALUE" };
      let matchedIndex = -1;
      for (let index = 0; index < lookupValues.length; index += 1) {
        const candidate = compareLookupOrder(lookupValues[index] ?? null, lookupValue);
        if (typeof candidate !== "number") return candidate;
        if (candidate <= 0) matchedIndex = index;
      }
      return matchedIndex >= 0 ? (resultValues[matchedIndex] ?? null) : { error: "NA" };
    }
    case "XLOOKUP": {
      if (args.length < 3) return { error: "VALUE" };
      const lookupValue = args[0] ?? null;
      const lookupValues = criteriaRangeValues(args[1] ?? null);
      const returnValues = criteriaRangeValues(args[2] ?? null);
      if (lookupValues.length !== returnValues.length) return { error: "VALUE" };
      for (let index = 0; index < lookupValues.length; index += 1) {
        const matches = compareCriteria(lookupValues[index] ?? null, lookupValue);
        if (typeof matches !== "boolean") return matches;
        if (matches) return returnValues[index] ?? null;
      }
      return args[3] ?? { error: "NA" };
    }
    default:
      return { error: "NAME" };
  }
}

function compareLookupOrder(left: FormulaValue, right: FormulaValue): number | FormulaError {
  const leftValue = scalarValue(left);
  const rightValue = scalarValue(right);
  if (isFormulaError(leftValue)) return leftValue;
  if (isFormulaError(rightValue)) return rightValue;
  if (typeof leftValue === "number" && typeof rightValue === "number") {
    return leftValue - rightValue;
  }
  return String(leftValue ?? "")
    .toUpperCase()
    .localeCompare(String(rightValue ?? "").toUpperCase());
}

function evaluateTableLookup(
  name: "VLOOKUP" | "HLOOKUP",
  args: FormulaAst[],
  context: FormulaEvaluationContext,
  currentSheet: string,
): FormulaValue {
  if (args.length < 3 || args[1]?.type !== "reference") return { error: "VALUE" };

  const lookupValue = evaluateAst(args[0] as FormulaAst, context, currentSheet);
  if (isFormulaError(lookupValue)) return lookupValue;
  const tableValue = evaluateAst(args[1], context, currentSheet);
  const tableValues = criteriaRangeValues(tableValue);
  const tableRange = args[1].range;
  const rows = tableRange.endRow - tableRange.startRow + 1;
  const columns = tableRange.endCol - tableRange.startCol + 1;
  const indexValue = toNumber(evaluateAst(args[2] as FormulaAst, context, currentSheet));
  if (typeof indexValue !== "number" || !Number.isInteger(indexValue) || indexValue < 1) {
    return { error: "VALUE" };
  }

  const approximateValue = args[3] ? toBoolean(evaluateAst(args[3], context, currentSheet)) : false;
  if (typeof approximateValue !== "boolean") return approximateValue;

  const lookupAcrossRows = name === "HLOOKUP";
  const lookupLength = lookupAcrossRows ? columns : rows;
  const resultLength = lookupAcrossRows ? rows : columns;
  if (indexValue > resultLength || tableValues.length !== rows * columns) {
    return { error: "REF" };
  }

  let matchedIndex = -1;
  for (let index = 0; index < lookupLength; index += 1) {
    const valueIndex = lookupAcrossRows ? index : index * columns;
    const candidate = tableValues[valueIndex] ?? null;
    const exact = compareCriteria(candidate, lookupValue);
    if (typeof exact !== "boolean") return exact;
    if (exact) {
      matchedIndex = index;
      break;
    }
    if (approximateValue) {
      const order = compareLookupOrder(candidate, lookupValue);
      if (typeof order !== "number") return order;
      if (order <= 0) matchedIndex = index;
    }
  }

  if (matchedIndex < 0) return { error: "NA" };
  const resultIndex = lookupAcrossRows
    ? (indexValue - 1) * columns + matchedIndex
    : matchedIndex * columns + indexValue - 1;
  return tableValues[resultIndex] ?? { error: "REF" };
}

function evaluateAst(
  ast: FormulaAst,
  context: FormulaEvaluationContext,
  currentSheet: string,
): FormulaValue {
  switch (ast.type) {
    case "literal":
      return ast.value;
    case "reference": {
      const sheetName = ast.sheetName ?? currentSheet;
      if (ast.range.startRow === ast.range.endRow && ast.range.startCol === ast.range.endCol) {
        return context.readCell(sheetName, ast.range.startRow, ast.range.startCol);
      }
      return context.readReference(ast);
    }
    case "unary": {
      const value = toNumber(evaluateAst(ast.operand, context, currentSheet));
      return ast.operator === "+" ? value : typeof value === "number" ? -value : value;
    }
    case "binary": {
      const left = evaluateAst(ast.left, context, currentSheet);
      const right = evaluateAst(ast.right, context, currentSheet);
      const error = firstError([left, right]);
      if (error) return error;
      if (ast.operator === "&") return `${left}${right}`;
      const leftValue = scalarValue(left);
      const rightValue = scalarValue(right);
      if (isFormulaError(leftValue)) return leftValue;
      if (isFormulaError(rightValue)) return rightValue;
      if (["=", "<>", ">", "<", ">=", "<="].includes(ast.operator)) {
        const equal = String(leftValue) === String(rightValue);
        return ast.operator === "="
          ? equal
          : ast.operator === "<>"
            ? !equal
            : ast.operator === ">"
              ? Number(leftValue) > Number(rightValue)
              : ast.operator === "<"
                ? Number(leftValue) < Number(rightValue)
                : ast.operator === ">="
                  ? Number(leftValue) >= Number(rightValue)
                  : Number(leftValue) <= Number(rightValue);
      }
      const leftNumber = toNumber(leftValue);
      const rightNumber = toNumber(rightValue);
      if (typeof leftNumber !== "number") return leftNumber;
      if (typeof rightNumber !== "number") return rightNumber;
      if (ast.operator === "/" && rightNumber === 0) return { error: "DIV_BY_ZERO" };
      if (ast.operator === "+") return leftNumber + rightNumber;
      if (ast.operator === "-") return leftNumber - rightNumber;
      if (ast.operator === "*") return leftNumber * rightNumber;
      if (ast.operator === "/") return leftNumber / rightNumber;
      return leftNumber ** rightNumber;
    }
    case "function": {
      if (ast.name === "VLOOKUP" || ast.name === "HLOOKUP") {
        return evaluateTableLookup(ast.name, ast.args, context, currentSheet);
      }
      if (ast.name === "IF") {
        const condition = toBoolean(
          ast.args[0] ? evaluateAst(ast.args[0], context, currentSheet) : false,
        );
        if (typeof condition !== "boolean") return condition;
        const branch = condition ? ast.args[1] : ast.args[2];
        return branch ? evaluateAst(branch, context, currentSheet) : condition;
      }
      if (ast.name === "IFERROR") {
        const value = ast.args[0]
          ? evaluateAst(ast.args[0], context, currentSheet)
          : { error: "VALUE" };
        if (!isFormulaError(value)) return value;
        return ast.args[1] ? evaluateAst(ast.args[1], context, currentSheet) : null;
      }
      if (ast.name === "IFNA") {
        const value = ast.args[0]
          ? evaluateAst(ast.args[0], context, currentSheet)
          : { error: "VALUE" };
        if (!isFormulaError(value) || value.error !== "NA") return value;
        return ast.args[1] ? evaluateAst(ast.args[1], context, currentSheet) : null;
      }
      if (ast.name === "ISERROR" || ast.name === "ISNA") {
        const value = ast.args[0]
          ? evaluateAst(ast.args[0], context, currentSheet)
          : { error: "VALUE" };
        return isFormulaError(value) && (ast.name === "ISERROR" || value.error === "NA");
      }
      if (ast.name === "INDEX") {
        return evaluateIndexValue(ast.args, context, currentSheet);
      }
      const args = ast.args.map((arg) => evaluateAst(arg, context, currentSheet));
      const error = firstError(args);
      return error ?? evaluateFunction(ast.name, args);
    }
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
