import { isFormulaError } from "../runtime.js";
import type { FormulaAst, FormulaError, FormulaValue } from "../types.js";

export interface FormulaFunctionContext {
  // Function handlers receive AST nodes so IF-like functions can preserve lazy evaluation.
  evaluate(ast: FormulaAst): FormulaValue;
  evaluateArgs(args: FormulaAst[]): FormulaValue[];
}

export type FormulaFunction = (args: FormulaAst[], context: FormulaFunctionContext) => FormulaValue;

export function eagerValues(
  args: FormulaAst[],
  context: FormulaFunctionContext,
): FormulaValue[] | FormulaError {
  const values = context.evaluateArgs(args);
  return values.find(isFormulaError) ?? values;
}
