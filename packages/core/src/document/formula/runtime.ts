import type { DocumentScalar } from "../model.js";
import type { FormulaError, FormulaValue } from "./types.js";

export function isFormulaError(value: FormulaValue): value is FormulaError {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "error" in value;
}

export function flatten(value: FormulaValue): FormulaValue[] {
  return Array.isArray(value) ? value.flatMap(flatten) : [value];
}

export function firstError(values: FormulaValue[]): FormulaError | null {
  return values.find(isFormulaError) ?? null;
}

export function scalarValue(value: FormulaValue): DocumentScalar | FormulaError {
  if (isFormulaError(value)) return value;
  return Array.isArray(value) ? scalarValue(value[0] ?? null) : value;
}

export function scalarText(value: FormulaValue): string | FormulaError {
  const scalar = scalarValue(value);
  return isFormulaError(scalar) ? scalar : String(scalar ?? "");
}

export function toNumber(value: FormulaValue): number | FormulaError {
  if (isFormulaError(value)) return value;
  if (Array.isArray(value)) return toNumber(value[0] ?? null);
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === null || value === "") return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : { error: "VALUE" };
}

export function toBoolean(value: FormulaValue): boolean | FormulaError {
  if (isFormulaError(value)) return value;
  if (Array.isArray(value)) return toBoolean(value[0] ?? null);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (value === null || value === "") return false;
  return value.toUpperCase() === "TRUE" || value !== "0";
}

export function criteriaRangeValues(value: FormulaValue): FormulaValue[] {
  return Array.isArray(value) ? flatten(value) : [value];
}

function valuesEqual(left: DocumentScalar, right: DocumentScalar): boolean {
  if (left === null || left === "") return right === null || right === "";
  if (right === null || right === "") return left === null || left === "";
  if (typeof left === "number" && typeof right === "number") return left === right;
  if (typeof left === "boolean" || typeof right === "boolean") return left === right;
  return String(left).toUpperCase() === String(right).toUpperCase();
}

export function compareCriteria(
  value: FormulaValue,
  criteria: FormulaValue,
): boolean | FormulaError {
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

export function compareLookupOrder(left: FormulaValue, right: FormulaValue): number | FormulaError {
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

export function validateCriteriaRanges(
  values: FormulaValue[],
  criteriaRanges: FormulaValue[],
): FormulaError | null {
  const expectedLength = values.length;
  return criteriaRanges.every((range) => criteriaRangeValues(range).length === expectedLength)
    ? null
    : { error: "VALUE" };
}

export function numericFunctionArgs(args: FormulaValue[]): number[] | FormulaError {
  const numbers = flatten(args.flatMap((arg) => flatten(arg))).map(toNumber);
  const error = firstError(numbers);
  return error ?? (numbers as number[]);
}

export function roundDecimal(value: number, digits: number, mode: "nearest" | "up" | "down") {
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
