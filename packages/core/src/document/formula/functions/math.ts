import { roundDecimal, toNumber } from "../runtime.js";
import { eagerValues, type FormulaFunction } from "./types.js";

const abs: FormulaFunction = (args, context) => {
  const values = eagerValues(args, context);
  if (!Array.isArray(values)) return values;
  const value = toNumber(values[0] ?? 0);
  return typeof value === "number" ? Math.abs(value) : value;
};

const round: FormulaFunction = (args, context) => {
  const values = eagerValues(args, context);
  if (!Array.isArray(values)) return values;
  const value = toNumber(values[0] ?? 0);
  const digits = toNumber(values[1] ?? 0);
  if (typeof value !== "number") return value;
  if (typeof digits !== "number") return digits;
  return roundDecimal(value, digits, "nearest");
};

const roundDirected =
  (mode: "up" | "down"): FormulaFunction =>
  (args, context) => {
    const values = eagerValues(args, context);
    if (!Array.isArray(values)) return values;
    const value = toNumber(values[0] ?? 0);
    const digits = toNumber(values[1] ?? 0);
    if (typeof value !== "number") return value;
    if (typeof digits !== "number") return digits;
    return roundDecimal(value, digits, mode);
  };

const int: FormulaFunction = (args, context) => {
  const values = eagerValues(args, context);
  if (!Array.isArray(values)) return values;
  const value = toNumber(values[0] ?? 0);
  return typeof value === "number" ? Math.floor(value) : value;
};

const mod: FormulaFunction = (args, context) => {
  const values = eagerValues(args, context);
  if (!Array.isArray(values)) return values;
  const dividend = toNumber(values[0] ?? 0);
  const divisor = toNumber(values[1] ?? 0);
  if (typeof dividend !== "number") return dividend;
  if (typeof divisor !== "number") return divisor;
  if (divisor === 0) return { error: "DIV_BY_ZERO" };
  return dividend - divisor * Math.floor(dividend / divisor);
};

export const mathFunctions: Record<string, FormulaFunction> = {
  ABS: abs,
  ROUND: round,
  ROUNDUP: roundDirected("up"),
  ROUNDDOWN: roundDirected("down"),
  INT: int,
  MOD: mod,
};
