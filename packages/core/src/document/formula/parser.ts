import { parseA1Cell } from "../range.js";
import type { FormulaAst } from "./types.js";

export class FormulaParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormulaParseError";
  }
}

export function normalizeFormula(formula: string): string {
  return formula.trim().replace(/^=/, "");
}

type Token = {
  kind: "number" | "string" | "identifier" | "operator" | "punctuation";
  text: string;
};

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
