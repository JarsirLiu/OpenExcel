import { evaluateFunction } from "./functions/registry.js";
import type { FormulaFunctionContext } from "./functions/types.js";
import { firstError, isFormulaError, scalarValue, toNumber } from "./runtime.js";
import type { FormulaAst, FormulaReferenceNode, FormulaValue } from "./types.js";

export interface FormulaEvaluationContext {
  readCell: (sheetName: string, row: number, col: number) => FormulaValue;
  readReference: (reference: FormulaReferenceNode) => FormulaValue;
}

function evaluateFunctionCall(
  ast: Extract<FormulaAst, { type: "function" }>,
  context: FormulaEvaluationContext,
  currentSheet: string,
): FormulaValue {
  // Argument evaluation belongs to the function handler; this keeps lazy and eager semantics in one dispatch path.
  const functionContext: FormulaFunctionContext = {
    evaluate: (child) => evaluateAst(child, context, currentSheet),
    evaluateArgs: (args) => args.map((arg) => evaluateAst(arg, context, currentSheet)),
  };
  return evaluateFunction(ast.name, ast.args, functionContext);
}

export function evaluateAst(
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
    case "function":
      return evaluateFunctionCall(ast, context, currentSheet);
  }
}
