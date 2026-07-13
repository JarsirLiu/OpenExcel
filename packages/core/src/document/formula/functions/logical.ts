import { firstError, flatten, isFormulaError, scalarValue, toBoolean } from "../runtime.js";
import { eagerValues, type FormulaFunction } from "./types.js";

const and: FormulaFunction = (args, context) => {
  const values = eagerValues(args, context);
  if (!Array.isArray(values)) return values;
  const booleans = flatten(values).map(toBoolean);
  const error = firstError(booleans);
  return error ?? (booleans as boolean[]).every(Boolean);
};

const or: FormulaFunction = (args, context) => {
  const values = eagerValues(args, context);
  if (!Array.isArray(values)) return values;
  const booleans = flatten(values).map(toBoolean);
  const error = firstError(booleans);
  return error ?? (booleans as boolean[]).some(Boolean);
};

const not: FormulaFunction = (args, context) => {
  const values = eagerValues(args, context);
  if (!Array.isArray(values)) return values;
  const value = toBoolean(values[0] ?? false);
  return typeof value === "boolean" ? !value : value;
};

const ifFunction: FormulaFunction = (args, context) => {
  const condition = toBoolean(args[0] ? context.evaluate(args[0]) : false);
  if (typeof condition !== "boolean") return condition;
  const branch = condition ? args[1] : args[2];
  return branch ? context.evaluate(branch) : condition;
};

const ifError: FormulaFunction = (args, context) => {
  const value = args[0] ? context.evaluate(args[0]) : { error: "VALUE" };
  if (!isFormulaError(value)) return value;
  return args[1] ? context.evaluate(args[1]) : null;
};

const ifNa: FormulaFunction = (args, context) => {
  const value = args[0] ? context.evaluate(args[0]) : { error: "VALUE" };
  if (!isFormulaError(value) || value.error !== "NA") return value;
  return args[1] ? context.evaluate(args[1]) : null;
};

const isError =
  (name: "ISERROR" | "ISNA"): FormulaFunction =>
  (args, context) => {
    const value = args[0] ? context.evaluate(args[0]) : { error: "VALUE" };
    return isFormulaError(value) && (name === "ISERROR" || value.error === "NA");
  };

const isType =
  (name: "ISNUMBER" | "ISTEXT" | "ISBLANK"): FormulaFunction =>
  (args, context) => {
    const value = scalarValue(args[0] ? context.evaluate(args[0]) : null);
    if (isFormulaError(value)) return false;
    if (name === "ISNUMBER") return typeof value === "number";
    if (name === "ISTEXT") return typeof value === "string";
    return value === null || value === "";
  };

export const logicalFunctions: Record<string, FormulaFunction> = {
  AND: and,
  OR: or,
  NOT: not,
  IF: ifFunction,
  IFERROR: ifError,
  IFNA: ifNa,
  ISERROR: isError("ISERROR"),
  ISNA: isError("ISNA"),
  ISNUMBER: isType("ISNUMBER"),
  ISTEXT: isType("ISTEXT"),
  ISBLANK: isType("ISBLANK"),
};
