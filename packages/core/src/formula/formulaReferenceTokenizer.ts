export type FormulaCellReference = {
  raw: string;
  absoluteColumn: boolean;
  column: number;
  absoluteRow: boolean;
  row: number;
};

export type FormulaToken =
  | { kind: "text"; value: string }
  | { kind: "reference"; value: FormulaCellReference };

function columnNumber(letters: string): number | null {
  let value = 0;
  for (const letter of letters.toUpperCase()) {
    value = value * 26 + letter.charCodeAt(0) - 64;
  }
  return value >= 1 && value <= 16_384 ? value : null;
}

function parseReference(value: string): FormulaCellReference | null {
  const match = value.match(/^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/);
  if (!match) return null;
  const column = columnNumber(match[2]);
  const row = Number(match[4]);
  if (column == null || !Number.isInteger(row) || row < 1 || row > 1_048_576) return null;
  return {
    raw: value,
    absoluteColumn: match[1] === "$",
    column,
    absoluteRow: match[3] === "$",
    row,
  };
}

function isIdentifierCharacter(value: string | undefined): boolean {
  return value != null && (/[A-Za-z0-9_.\\]/.test(value) || value.charCodeAt(0) > 127);
}

function readReference(formula: string, start: number): FormulaCellReference | null {
  const match = formula.slice(start).match(/^\$?[A-Za-z]{1,3}\$?\d+/)?.[0];
  if (!match) return null;
  if (
    isIdentifierCharacter(formula[start - 1]) ||
    isIdentifierCharacter(formula[start + match.length])
  ) {
    return null;
  }
  const next = formula[start + match.length];
  if (next === "(") return null;
  return parseReference(match);
}

/** Tokenizes formula text while preserving strings, function names and names. */
export function tokenizeFormula(formula: string): FormulaToken[] {
  const tokens: FormulaToken[] = [];
  let text = "";
  let cursor = 0;
  let inString = false;
  let inSheetName = false;
  let bracketDepth = 0;

  const flushText = () => {
    if (text.length > 0) {
      tokens.push({ kind: "text", value: text });
      text = "";
    }
  };

  while (cursor < formula.length) {
    const char = formula[cursor];
    if (char === '"') {
      text += char;
      if (formula[cursor + 1] === '"') {
        text += '"';
        cursor += 2;
        continue;
      }
      inString = !inString;
      cursor += 1;
      continue;
    }
    if (!inString && char === "'") {
      text += char;
      if (inSheetName && formula[cursor + 1] === "'") {
        text += "'";
        cursor += 2;
        continue;
      }
      inSheetName = !inSheetName;
      cursor += 1;
      continue;
    }
    if (!inString && !inSheetName) {
      if (char === "[") bracketDepth += 1;
      if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
      const reference = readReference(formula, cursor);
      if (reference && bracketDepth === 0) {
        flushText();
        tokens.push({ kind: "reference", value: reference });
        cursor += reference.raw.length;
        continue;
      }
    }
    text += char;
    cursor += 1;
  }
  flushText();
  return tokens;
}
