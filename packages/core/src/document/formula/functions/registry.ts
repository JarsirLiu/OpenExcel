import type { FormulaAst, FormulaValue } from "../types.js";
import { aggregateFunctions } from "./aggregate.js";
import { logicalFunctions } from "./logical.js";
import { lookupFunctions } from "./lookup.js";
import { mathFunctions } from "./math.js";
import { textFunctions } from "./text.js";
import type { FormulaFunction, FormulaFunctionContext } from "./types.js";

const functions: Record<string, FormulaFunction> = {
  ...aggregateFunctions,
  ...lookupFunctions,
  ...logicalFunctions,
  ...mathFunctions,
  ...textFunctions,
};

export function evaluateFunction(
  name: string,
  args: FormulaAst[],
  context: FormulaFunctionContext,
): FormulaValue {
  return functions[name]?.(args, context) ?? { error: "NAME" };
}
