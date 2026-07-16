import type { FortuneCellValue } from "./celldataUtils.js";

export type FortuneCellScalar = string | number | boolean | null | Date;

export interface FortuneCellNormalizationOptions {
  inferGeneralNumeric?: boolean;
}

const GENERAL_NUMBER_PATTERN = /^[+-]?(?:(?:0|[1-9]\d*)(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

export function normalizeFortuneFormula(formula?: unknown): string | undefined {
  if (typeof formula !== "string") return undefined;
  const trimmed = formula.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^=/, "");
}

function cellTypeOf(value: FortuneCellValue): string | undefined {
  const type = value.ct?.t;
  return typeof type === "string" ? type.toLowerCase() : undefined;
}

function toNumericValue(raw: unknown): FortuneCellScalar {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : String(raw);
  if (typeof raw === "string" && raw.trim() !== "") {
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) return numeric;
  }
  return typeof raw === "string" || typeof raw === "number" ? raw : String(raw);
}

function isGeneralNumericValue(
  value: FortuneCellValue,
  options: FortuneCellNormalizationOptions,
): boolean {
  const type = cellTypeOf(value);
  if (type === "n") return true;
  if (!options.inferGeneralNumeric) return false;
  if (type != null && type !== "" && type !== "general") return false;
  if (value.qp != null && Number(value.qp) !== 0) return false;
  if (typeof value.v === "number") return Number.isFinite(value.v);
  return typeof value.v === "string" && GENERAL_NUMBER_PATTERN.test(value.v.trim());
}

export function fortuneCellValueToScalar(
  value: FortuneCellValue,
  options: FortuneCellNormalizationOptions = {},
): FortuneCellScalar {
  const raw = value.v;
  if (raw == null) return null;
  if (raw instanceof Date) return raw;

  switch (cellTypeOf(value)) {
    case "n":
      return toNumericValue(raw);
    case "b":
      if (typeof raw === "boolean") return raw;
      if (raw === 1 || raw === "1" || raw === "true") return true;
      if (raw === 0 || raw === "0" || raw === "false") return false;
      return String(raw);
    default:
      if (isGeneralNumericValue(value, options)) return toNumericValue(raw);
      if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
        return raw;
      }
      return String(raw);
  }
}

export function displayValueOfFortuneScalar(value: FortuneCellScalar): string {
  if (value == null) return "";
  return value instanceof Date ? value.toISOString() : String(value);
}

export function normalizeFortuneCellValue(
  value: FortuneCellValue,
  options: FortuneCellNormalizationOptions = {},
): FortuneCellValue {
  const scalar = fortuneCellValueToScalar(value, options);
  const formula = normalizeFortuneFormula(value.f);
  const inferredNumeric = isGeneralNumericValue(value, options);
  const originalType = cellTypeOf(value);
  const cellType = inferredNumeric ? "n" : originalType === "inlinestr" ? "s" : originalType;
  const displayValue = value.m ?? displayValueOfFortuneScalar(scalar);
  const typeChanged = value.ct != null && cellType !== value.ct.t;
  const horizontalAlignment = value.ht ?? (inferredNumeric ? 2 : undefined);
  if (
    scalar === value.v &&
    displayValue === value.m &&
    formula === value.f &&
    !typeChanged &&
    horizontalAlignment === value.ht
  ) {
    return value;
  }

  const next: FortuneCellValue = {
    ...value,
    v: scalar,
    m: displayValue,
  };

  if (horizontalAlignment != null) next.ht = horizontalAlignment;

  if (formula) next.f = formula;
  else delete next.f;

  if (value.ct && cellType !== value.ct.t) {
    if (cellType) next.ct = { ...value.ct, t: cellType };
    else delete next.ct;
  } else if (inferredNumeric && value.ct == null) {
    next.ct = { t: "n" };
  }

  return next;
}
