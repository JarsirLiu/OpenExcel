import { flatten, scalarText, toNumber } from "../runtime.js";
import { eagerValues, type FormulaFunction } from "./types.js";

const concatenate: FormulaFunction = (args, context) => {
  const values = eagerValues(args, context);
  if (!Array.isArray(values)) return values;
  return flatten(values)
    .map((value) => String(value ?? ""))
    .join("");
};

const length: FormulaFunction = (args, context) => {
  const values = eagerValues(args, context);
  if (!Array.isArray(values)) return values;
  const value = scalarText(values[0] ?? null);
  return typeof value === "string" ? value.length : value;
};

const leftRight =
  (name: "LEFT" | "RIGHT"): FormulaFunction =>
  (args, context) => {
    const values = eagerValues(args, context);
    if (!Array.isArray(values)) return values;
    const value = scalarText(values[0] ?? null);
    const count = values[1] === undefined ? 1 : toNumber(values[1]);
    if (typeof value !== "string") return value;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
      return typeof count === "number" ? { error: "VALUE" } : count;
    }
    return name === "LEFT" ? value.slice(0, count) : count === 0 ? "" : value.slice(-count);
  };

const mid: FormulaFunction = (args, context) => {
  const values = eagerValues(args, context);
  if (!Array.isArray(values)) return values;
  const value = scalarText(values[0] ?? null);
  const start = values[1] === undefined ? 0 : toNumber(values[1]);
  const count = values[2] === undefined ? 0 : toNumber(values[2]);
  if (typeof value !== "string") return value;
  if (
    typeof start !== "number" ||
    typeof count !== "number" ||
    !Number.isInteger(start) ||
    !Number.isInteger(count) ||
    start < 1 ||
    count < 0
  ) {
    return typeof start !== "number"
      ? start
      : typeof count !== "number"
        ? count
        : { error: "VALUE" };
  }
  return value.slice(start - 1, start - 1 + count);
};

const trim: FormulaFunction = (args, context) => {
  const values = eagerValues(args, context);
  if (!Array.isArray(values)) return values;
  const value = scalarText(values[0] ?? null);
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value;
};

const upperLower =
  (name: "UPPER" | "LOWER"): FormulaFunction =>
  (args, context) => {
    const values = eagerValues(args, context);
    if (!Array.isArray(values)) return values;
    const value = scalarText(values[0] ?? null);
    if (typeof value !== "string") return value;
    return name === "UPPER" ? value.toUpperCase() : value.toLowerCase();
  };

const findSearch =
  (name: "FIND" | "SEARCH"): FormulaFunction =>
  (args, context) => {
    const values = eagerValues(args, context);
    if (!Array.isArray(values)) return values;
    const needle = scalarText(values[0] ?? null);
    const haystack = scalarText(values[1] ?? null);
    const start = values[2] === undefined ? 1 : toNumber(values[2]);
    if (typeof needle !== "string") return needle;
    if (typeof haystack !== "string") return haystack;
    if (typeof start !== "number") return start;
    if (!Number.isInteger(start) || start < 1) return { error: "VALUE" };
    const index =
      name === "SEARCH"
        ? haystack.toUpperCase().indexOf(needle.toUpperCase(), start - 1)
        : haystack.indexOf(needle, start - 1);
    return index < 0 ? { error: "VALUE" } : index + 1;
  };

const substitute: FormulaFunction = (args, context) => {
  const values = eagerValues(args, context);
  if (!Array.isArray(values)) return values;
  const source = scalarText(values[0] ?? null);
  const oldText = scalarText(values[1] ?? null);
  const newText = scalarText(values[2] ?? null);
  if (typeof source !== "string") return source;
  if (typeof oldText !== "string") return oldText;
  if (typeof newText !== "string") return newText;
  if (values[3] === undefined) return source.split(oldText).join(newText);
  const instance = toNumber(values[3]);
  if (typeof instance !== "number") return instance;
  if (!Number.isInteger(instance) || instance < 1) return { error: "VALUE" };
  const parts = source.split(oldText);
  if (instance >= parts.length) return source;
  return `${parts.slice(0, instance).join(oldText)}${newText}${parts.slice(instance).join(oldText)}`;
};

export const textFunctions: Record<string, FormulaFunction> = {
  CONCATENATE: concatenate,
  LEN: length,
  LEFT: leftRight("LEFT"),
  RIGHT: leftRight("RIGHT"),
  MID: mid,
  TRIM: trim,
  UPPER: upperLower("UPPER"),
  LOWER: upperLower("LOWER"),
  FIND: findSearch("FIND"),
  SEARCH: findSearch("SEARCH"),
  SUBSTITUTE: substitute,
};
