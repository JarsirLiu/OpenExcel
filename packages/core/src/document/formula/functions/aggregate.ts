import {
  compareCriteria,
  criteriaRangeValues,
  firstError,
  flatten,
  isFormulaError,
  scalarValue,
  toNumber,
  validateCriteriaRanges,
} from "../runtime.js";
import type { FormulaError, FormulaValue } from "../types.js";
import { eagerValues, type FormulaFunction } from "./types.js";

function conditionalMatches(
  row: number,
  criteriaRanges: FormulaValue[][],
  criteriaValues: FormulaValue[],
): boolean | FormulaError {
  for (let index = 0; index < criteriaRanges.length; index += 1) {
    const match = compareCriteria(
      criteriaRanges[index]?.[row] ?? null,
      criteriaValues[index] ?? null,
    );
    if (typeof match !== "boolean") return match;
    if (!match) return false;
  }
  return true;
}

const sum: FormulaFunction = (args, context) => {
  const values = eagerValues(args, context);
  if (!Array.isArray(values)) return values;
  const numbers = flatten(values).map(toNumber);
  const error = firstError(numbers);
  return error ?? numbers.reduce<number>((total, value) => total + (value as number), 0);
};

const average: FormulaFunction = (args, context) => {
  const values = eagerValues(args, context);
  if (!Array.isArray(values)) return values;
  const numbers = flatten(values).map(toNumber);
  const error = firstError(numbers);
  if (error) return error;
  return numbers.length === 0
    ? { error: "DIV_BY_ZERO" }
    : numbers.reduce<number>((total, value) => total + (value as number), 0) / numbers.length;
};

const minMax =
  (name: "MIN" | "MAX"): FormulaFunction =>
  (args, context) => {
    const values = eagerValues(args, context);
    if (!Array.isArray(values)) return values;
    const numbers = flatten(values).map(toNumber);
    const error = firstError(numbers);
    if (error) return error;
    if (numbers.length === 0) return 0;
    return name === "MIN" ? Math.min(...(numbers as number[])) : Math.max(...(numbers as number[]));
  };

const product: FormulaFunction = (args, context) => {
  const values = eagerValues(args, context);
  if (!Array.isArray(values)) return values;
  const numbers = flatten(values).map(toNumber);
  const error = firstError(numbers);
  return error ?? numbers.reduce<number>((total, value) => total * (value as number), 1);
};

const sumProduct: FormulaFunction = (args, context) => {
  const values = eagerValues(args, context);
  if (!Array.isArray(values)) return values;
  if (values.length === 0) return { error: "VALUE" };
  const ranges = values.map(criteriaRangeValues);
  const length = ranges[0]?.length ?? 0;
  if (length === 0 || ranges.some((range) => range.length !== length)) return { error: "VALUE" };
  let total = 0;
  for (let row = 0; row < length; row += 1) {
    let productValue = 1;
    for (const range of ranges) {
      const number = toNumber(range[row] ?? null);
      if (typeof number !== "number") return number;
      productValue *= number;
    }
    total += productValue;
  }
  return total;
};

const count: FormulaFunction = (args, context) => {
  const values = eagerValues(args, context);
  if (!Array.isArray(values)) return values;
  return flatten(values).filter((value) => typeof value === "number").length;
};

const countA: FormulaFunction = (args, context) => {
  const values = eagerValues(args, context);
  if (!Array.isArray(values)) return values;
  return flatten(values).filter((value) => value !== null && value !== "").length;
};

const countBlank: FormulaFunction = (args, context) => {
  const values = eagerValues(args, context);
  if (!Array.isArray(values)) return values;
  return values
    .flatMap((value) => flatten(value))
    .filter((value) => {
      const scalar = scalarValue(value);
      return !isFormulaError(scalar) && (scalar === null || scalar === "");
    }).length;
};

const sumIf: FormulaFunction = (args, context) => {
  const values = eagerValues(args, context);
  if (!Array.isArray(values)) return values;
  const criteriaValues = criteriaRangeValues(values[0] ?? null);
  const criteria = values[1] ?? null;
  const sumValues = criteriaRangeValues(values[2] ?? values[0] ?? null);
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
};

const sumIfs: FormulaFunction = (args, context) => {
  const values = eagerValues(args, context);
  if (!Array.isArray(values)) return values;
  if (values.length < 3 || values.length % 2 === 0) return { error: "VALUE" };
  const sumValues = criteriaRangeValues(values[0] ?? null);
  const criteriaRanges: FormulaValue[][] = [];
  const criteriaValues: FormulaValue[] = [];
  for (let index = 1; index < values.length; index += 2) {
    criteriaRanges.push(criteriaRangeValues(values[index] ?? null));
    criteriaValues.push(values[index + 1] ?? null);
  }
  const lengthError = validateCriteriaRanges(sumValues, criteriaRanges);
  if (lengthError) return lengthError;
  let total = 0;
  for (let row = 0; row < sumValues.length; row += 1) {
    const matches = conditionalMatches(row, criteriaRanges, criteriaValues);
    if (typeof matches !== "boolean") return matches;
    if (!matches) continue;
    const number = toNumber(sumValues[row] ?? null);
    if (typeof number !== "number") return number;
    total += number;
  }
  return total;
};

const averageIf: FormulaFunction = (args, context) => {
  const values = eagerValues(args, context);
  if (!Array.isArray(values)) return values;
  const criteriaValues = criteriaRangeValues(values[0] ?? null);
  const criteria = values[1] ?? null;
  const averageValues = criteriaRangeValues(values[2] ?? values[0] ?? null);
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
};

const averageIfs: FormulaFunction = (args, context) => {
  const values = eagerValues(args, context);
  if (!Array.isArray(values)) return values;
  if (values.length < 3 || values.length % 2 === 0) return { error: "VALUE" };
  const averageValues = criteriaRangeValues(values[0] ?? null);
  const criteriaRanges: FormulaValue[][] = [];
  const criteriaValues: FormulaValue[] = [];
  for (let index = 1; index < values.length; index += 2) {
    criteriaRanges.push(criteriaRangeValues(values[index] ?? null));
    criteriaValues.push(values[index + 1] ?? null);
  }
  const lengthError = validateCriteriaRanges(averageValues, criteriaRanges);
  if (lengthError) return lengthError;
  const numbers: number[] = [];
  for (let row = 0; row < averageValues.length; row += 1) {
    const matches = conditionalMatches(row, criteriaRanges, criteriaValues);
    if (typeof matches !== "boolean") return matches;
    if (!matches) continue;
    const value = scalarValue(averageValues[row] ?? null);
    if (isFormulaError(value)) return value;
    if (typeof value === "number") numbers.push(value);
  }
  return numbers.length === 0
    ? { error: "DIV_BY_ZERO" }
    : numbers.reduce((a, b) => a + b, 0) / numbers.length;
};

const minMaxIfs =
  (name: "MINIFS" | "MAXIFS"): FormulaFunction =>
  (args, context) => {
    const values = eagerValues(args, context);
    if (!Array.isArray(values)) return values;
    if (values.length < 3 || values.length % 2 === 0) return { error: "VALUE" };
    const targetValues = criteriaRangeValues(values[0] ?? null);
    const criteriaRanges: FormulaValue[][] = [];
    const criteriaValues: FormulaValue[] = [];
    for (let index = 1; index < values.length; index += 2) {
      criteriaRanges.push(criteriaRangeValues(values[index] ?? null));
      criteriaValues.push(values[index + 1] ?? null);
    }
    const lengthError = validateCriteriaRanges(targetValues, criteriaRanges);
    if (lengthError) return lengthError;
    const numbers: number[] = [];
    for (let row = 0; row < targetValues.length; row += 1) {
      const matches = conditionalMatches(row, criteriaRanges, criteriaValues);
      if (typeof matches !== "boolean") return matches;
      if (!matches) continue;
      const value = scalarValue(targetValues[row] ?? null);
      if (isFormulaError(value)) return value;
      if (typeof value === "number") numbers.push(value);
    }
    if (numbers.length === 0) return 0;
    return name === "MAXIFS" ? Math.max(...numbers) : Math.min(...numbers);
  };

const countIf: FormulaFunction = (args, context) => {
  const values = eagerValues(args, context);
  if (!Array.isArray(values)) return values;
  const criteriaValues = criteriaRangeValues(values[0] ?? null);
  const criteria = values[1] ?? null;
  let countValue = 0;
  for (const value of criteriaValues) {
    const matches = compareCriteria(value, criteria);
    if (typeof matches !== "boolean") return matches;
    if (matches) countValue += 1;
  }
  return countValue;
};

const countIfs: FormulaFunction = (args, context) => {
  const values = eagerValues(args, context);
  if (!Array.isArray(values)) return values;
  if (values.length < 2 || values.length % 2 !== 0) return { error: "VALUE" };
  const criteriaRanges: FormulaValue[][] = [];
  const criteriaValues: FormulaValue[] = [];
  for (let index = 0; index < values.length; index += 2) {
    criteriaRanges.push(criteriaRangeValues(values[index] ?? null));
    criteriaValues.push(values[index + 1] ?? null);
  }
  const firstRange = criteriaRanges[0] ?? [];
  const lengthError = validateCriteriaRanges(firstRange, criteriaRanges);
  if (lengthError) return lengthError;
  let countValue = 0;
  for (let row = 0; row < firstRange.length; row += 1) {
    const matches = conditionalMatches(row, criteriaRanges, criteriaValues);
    if (typeof matches !== "boolean") return matches;
    if (matches) countValue += 1;
  }
  return countValue;
};

export const aggregateFunctions: Record<string, FormulaFunction> = {
  SUM: sum,
  AVERAGE: average,
  MIN: minMax("MIN"),
  MAX: minMax("MAX"),
  PRODUCT: product,
  SUMPRODUCT: sumProduct,
  COUNT: count,
  COUNTA: countA,
  COUNTBLANK: countBlank,
  SUMIF: sumIf,
  SUMIFS: sumIfs,
  AVERAGEIF: averageIf,
  AVERAGEIFS: averageIfs,
  MINIFS: minMaxIfs("MINIFS"),
  MAXIFS: minMaxIfs("MAXIFS"),
  COUNTIF: countIf,
  COUNTIFS: countIfs,
};
