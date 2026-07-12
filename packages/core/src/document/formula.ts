import type { CellRange } from "./model.js";
import { parseA1Range } from "./range.js";

export interface FormulaReference {
  sheetName?: string;
  reference: string;
  range: CellRange;
}

const referencePattern =
  /(?:(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_. ]*))!)?(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?)/g;

function normalizeReference(reference: string): string {
  return reference.replace(/\$/g, "").toUpperCase();
}

function normalizeSheetName(quotedName: string | undefined, plainName: string | undefined) {
  const name = quotedName ?? plainName;
  return name ? name.replace(/''/g, "'").trim() : undefined;
}

/**
 * Extracts A1-style references from a formula for dependency indexing.
 * It intentionally records ranges as ranges instead of expanding every cell.
 */
export function extractFormulaReferences(formula: string): FormulaReference[] {
  const normalizedFormula = formula.trim().replace(/^=/, "");
  const references: FormulaReference[] = [];
  const seen = new Set<string>();

  for (const match of normalizedFormula.matchAll(referencePattern)) {
    const reference = normalizeReference(match[3] ?? "");
    if (!reference) continue;

    let range: CellRange;
    try {
      range = parseA1Range(reference);
    } catch {
      continue;
    }

    const sheetName = normalizeSheetName(match[1], match[2]);
    const key = `${sheetName ?? ""}!${reference}`;
    if (seen.has(key)) continue;
    seen.add(key);
    references.push({ sheetName, reference, range });
  }

  return references;
}
