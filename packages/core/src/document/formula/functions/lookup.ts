import {
  compareCriteria,
  compareLookupOrder,
  criteriaRangeValues,
  isFormulaError,
  scalarValue,
  toBoolean,
  toNumber,
} from "../runtime.js";
import type { FormulaAst, FormulaValue } from "../types.js";
import { eagerValues, type FormulaFunction, type FormulaFunctionContext } from "./types.js";

const index: FormulaFunction = (args, context) => {
  const source = args[0];
  if (source?.type !== "reference") return { error: "VALUE" };
  const values = criteriaRangeValues(context.evaluate(source));
  const rows = source.range.endRow - source.range.startRow + 1;
  const columns = source.range.endCol - source.range.startCol + 1;
  if (values.length !== rows * columns) return { error: "REF" };

  const rowNumber = toNumber(args[1] ? context.evaluate(args[1]) : { error: "VALUE" });
  const columnNumber = args[2] === undefined ? 1 : toNumber(context.evaluate(args[2]));
  if (typeof rowNumber !== "number") return rowNumber;
  if (typeof columnNumber !== "number") return columnNumber;
  if (!Number.isInteger(rowNumber) || !Number.isInteger(columnNumber)) return { error: "VALUE" };
  if (rowNumber < 0 || columnNumber < 0 || rowNumber > rows || columnNumber > columns) {
    return { error: "REF" };
  }
  if (rowNumber === 0 && columnNumber === 0) return { error: "VALUE" };
  if (rowNumber === 0) {
    return values.filter((_, valueIndex) => valueIndex % columns === columnNumber - 1);
  }
  if (columnNumber === 0) {
    const start = (rowNumber - 1) * columns;
    return values.slice(start, start + columns);
  }
  return values[(rowNumber - 1) * columns + columnNumber - 1] ?? { error: "REF" };
};

const match: FormulaFunction = (args, context) => {
  const values = eagerValues(args, context);
  if (!Array.isArray(values)) return values;
  const lookupValue = values[0] ?? null;
  const lookupValues = criteriaRangeValues(values[1] ?? null);
  const matchType = toNumber(values[2] ?? 0);
  if (typeof matchType !== "number") return matchType;
  if (![1, 0, -1].includes(matchType)) return { error: "NA" };
  let approximateIndex = -1;
  for (let valueIndex = 0; valueIndex < lookupValues.length; valueIndex += 1) {
    const matches = compareCriteria(lookupValues[valueIndex] ?? null, lookupValue);
    if (typeof matches !== "boolean") return matches;
    if (matches) return valueIndex + 1;
    if (matchType !== 0) {
      const order = compareLookupOrder(lookupValues[valueIndex] ?? null, lookupValue);
      if (typeof order !== "number") return order;
      if ((matchType === 1 && order <= 0) || (matchType === -1 && order >= 0)) {
        approximateIndex = valueIndex;
      }
    }
  }
  return approximateIndex >= 0 ? approximateIndex + 1 : { error: "NA" };
};

const lookup: FormulaFunction = (args, context) => {
  const values = eagerValues(args, context);
  if (!Array.isArray(values)) return values;
  if (values.length < 2) return { error: "VALUE" };
  const lookupValue = scalarValue(values[0] ?? null);
  const lookupValues = criteriaRangeValues(values[1] ?? null);
  const resultValues = criteriaRangeValues(values[2] ?? values[1] ?? null);
  if (lookupValues.length !== resultValues.length) return { error: "VALUE" };
  let matchedIndex = -1;
  for (let valueIndex = 0; valueIndex < lookupValues.length; valueIndex += 1) {
    const candidate = compareLookupOrder(lookupValues[valueIndex] ?? null, lookupValue);
    if (typeof candidate !== "number") return candidate;
    if (candidate <= 0) matchedIndex = valueIndex;
  }
  return matchedIndex >= 0 ? (resultValues[matchedIndex] ?? null) : { error: "NA" };
};

const xlookup: FormulaFunction = (args, context) => {
  if (args.length < 3) return { error: "VALUE" };
  const values = eagerValues(args.slice(0, 3), context);
  if (!Array.isArray(values)) return values;
  const lookupValue = values[0] ?? null;
  const lookupValues = criteriaRangeValues(values[1] ?? null);
  const returnValues = criteriaRangeValues(values[2] ?? null);
  if (lookupValues.length !== returnValues.length) return { error: "VALUE" };
  for (let valueIndex = 0; valueIndex < lookupValues.length; valueIndex += 1) {
    const matches = compareCriteria(lookupValues[valueIndex] ?? null, lookupValue);
    if (typeof matches !== "boolean") return matches;
    if (matches) return returnValues[valueIndex] ?? null;
  }
  return args[3] ? context.evaluate(args[3]) : { error: "NA" };
};

function evaluateTableLookup(
  name: "VLOOKUP" | "HLOOKUP",
  args: FormulaAst[],
  context: FormulaFunctionContext,
): FormulaValue {
  if (args.length < 3 || args[1]?.type !== "reference") return { error: "VALUE" };

  const lookupValue = context.evaluate(args[0] as FormulaAst);
  if (isFormulaError(lookupValue)) return lookupValue;
  const tableValues = criteriaRangeValues(context.evaluate(args[1]));
  const tableRange = args[1].range;
  const rows = tableRange.endRow - tableRange.startRow + 1;
  const columns = tableRange.endCol - tableRange.startCol + 1;
  const indexValue = toNumber(context.evaluate(args[2] as FormulaAst));
  if (typeof indexValue !== "number" || !Number.isInteger(indexValue) || indexValue < 1) {
    return { error: "VALUE" };
  }

  const approximateValue = args[3] ? toBoolean(context.evaluate(args[3])) : false;
  if (typeof approximateValue !== "boolean") return approximateValue;
  const lookupAcrossRows = name === "HLOOKUP";
  const lookupLength = lookupAcrossRows ? columns : rows;
  const resultLength = lookupAcrossRows ? rows : columns;
  if (indexValue > resultLength || tableValues.length !== rows * columns) return { error: "REF" };

  let matchedIndex = -1;
  for (let valueIndex = 0; valueIndex < lookupLength; valueIndex += 1) {
    const candidateIndex = lookupAcrossRows ? valueIndex : valueIndex * columns;
    const candidate = tableValues[candidateIndex] ?? null;
    const exact = compareCriteria(candidate, lookupValue);
    if (typeof exact !== "boolean") return exact;
    if (exact) {
      matchedIndex = valueIndex;
      break;
    }
    if (approximateValue) {
      const order = compareLookupOrder(candidate, lookupValue);
      if (typeof order !== "number") return order;
      if (order <= 0) matchedIndex = valueIndex;
    }
  }
  if (matchedIndex < 0) return { error: "NA" };
  const resultIndex = lookupAcrossRows
    ? (indexValue - 1) * columns + matchedIndex
    : matchedIndex * columns + indexValue - 1;
  return tableValues[resultIndex] ?? { error: "REF" };
}

const vlookup: FormulaFunction = (args, context) => evaluateTableLookup("VLOOKUP", args, context);
const hlookup: FormulaFunction = (args, context) => evaluateTableLookup("HLOOKUP", args, context);

export const lookupFunctions: Record<string, FormulaFunction> = {
  INDEX: index,
  MATCH: match,
  LOOKUP: lookup,
  XLOOKUP: xlookup,
  VLOOKUP: vlookup,
  HLOOKUP: hlookup,
};
