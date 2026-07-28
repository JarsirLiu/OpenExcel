import type { FortuneCellValue } from "./celldataUtils.js";

export type FortuneCellScalar = string | number | boolean | null | Date;

export interface FortuneCellNormalizationOptions {
  inferGeneralNumeric?: boolean;
}

const EXCEL_EPOCH_DAYS = daysFromCivil(1899, 12, 30);
const DATE_VALUE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/;

const GENERAL_NUMBER_PATTERN = /^[+-]?(?:(?:0|[1-9]\d*)(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function daysFromCivil(year: number, month: number, day: number): number {
  const adjustedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

function civilFromDays(days: number): { year: number; month: number; day: number } {
  const shifted = days + 719468;
  const era = Math.floor(shifted / 146097);
  const dayOfEra = shifted - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  const year = yearOfEra + era * 400;
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthPart = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPart + 2) / 5) + 1;
  const month = monthPart + (monthPart < 10 ? 3 : -9);
  return { year: year + (month <= 2 ? 1 : 0), month, day };
}

function isValidCivilDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return daysFromCivil(nextYear, nextMonth, 1) - daysFromCivil(year, month, 1) >= day;
}

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

function excelSerialDay(serial: number): number {
  const whole = Math.floor(serial);
  // Excel's 1900 date system contains the fictitious 1900-02-29 at serial 60.
  return whole < 60 ? whole + 1 : whole;
}

function dateTextFromDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();
  const base = `${year.toString().padStart(4, "0")}-${padDatePart(month)}-${padDatePart(day)}`;
  return hours === 0 && minutes === 0 && seconds === 0
    ? base
    : `${base} ${padDatePart(hours)}:${padDatePart(minutes)}:${padDatePart(seconds)}`;
}

/** Returns true for cells whose numeric value is governed by a date-like format. */
export function isDateLikeNumberFormat(format: unknown): format is string {
  if (typeof format !== "string" || !format.trim()) return false;
  const withoutLiterals = format
    .replace(/"(?:[^"]|"")*"/g, "")
    .replace(/\\./g, "")
    .replace(/\[[^\]]*\]/g, "");
  return /[ymdhs]/i.test(withoutLiterals) && !/^general$/i.test(withoutLiterals.trim());
}

export function isFortuneDateCell(value: FortuneCellValue): boolean {
  if (value.ct?.t?.toLowerCase() === "d") return true;
  return typeof value.v === "number" && isDateLikeNumberFormat(value.ct?.fa);
}

/** Converts an Excel 1900-system serial into a timezone-free model value. */
export function excelSerialToDateText(serial: number): string | undefined {
  if (!Number.isFinite(serial) || serial < 0 || serial > 2_958_465) return undefined;

  const whole = Math.floor(serial);
  const fraction = serial - whole;
  if (whole === 60) {
    const totalSeconds = Math.round(fraction * 86_400);
    const hours = Math.floor(totalSeconds / 3_600) % 24;
    const minutes = Math.floor((totalSeconds % 3_600) / 60);
    const seconds = totalSeconds % 60;
    const base = "1900-02-29";
    return totalSeconds === 0
      ? base
      : `${base} ${padDatePart(hours)}:${padDatePart(minutes)}:${padDatePart(seconds)}`;
  }

  const civil = civilFromDays(EXCEL_EPOCH_DAYS + excelSerialDay(serial));
  const totalSeconds = Math.round(fraction * 86_400);
  if (totalSeconds >= 86_400) {
    const next = civilFromDays(EXCEL_EPOCH_DAYS + excelSerialDay(serial) + 1);
    return `${next.year.toString().padStart(4, "0")}-${padDatePart(next.month)}-${padDatePart(next.day)}`;
  }
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const base = `${civil.year.toString().padStart(4, "0")}-${padDatePart(civil.month)}-${padDatePart(civil.day)}`;
  return totalSeconds === 0
    ? base
    : `${base} ${padDatePart(hours)}:${padDatePart(minutes)}:${padDatePart(seconds)}`;
}

/** Converts a timezone-free model value into an Excel 1900-system serial. */
export function dateTextToExcelSerial(value: string): number {
  const match = value.trim().match(DATE_VALUE_PATTERN);
  if (!match) throw new Error("日期必须使用 YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss 格式");

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hours = Number(match[4] ?? 0);
  const minutes = Number(match[5] ?? 0);
  const seconds = Number(match[6] ?? 0);
  const milliseconds = Number((match[7] ?? "").padEnd(3, "0"));
  const isFictitiousLeapDay = year === 1900 && month === 2 && day === 29;
  if (
    (!isFictitiousLeapDay && !isValidCivilDate(year, month, day)) ||
    hours > 23 ||
    minutes > 59 ||
    seconds > 59 ||
    milliseconds > 999
  ) {
    throw new Error("日期值无效");
  }
  if (isFictitiousLeapDay) {
    return 60 + (hours * 3_600 + minutes * 60 + seconds + milliseconds / 1_000) / 86_400;
  }

  const days = daysFromCivil(year, month, day) - EXCEL_EPOCH_DAYS;
  const serial = days < 61 ? days - 1 : days;
  const result = serial + (hours * 3_600 + minutes * 60 + seconds + milliseconds / 1_000) / 86_400;
  if (result < 0 || result > 2_958_465) throw new Error("日期超出 Excel 支持范围");
  return result;
}

export function fortuneDateText(value: FortuneCellValue): string | undefined {
  if (!isFortuneDateCell(value)) return undefined;
  if (typeof value.v === "number") return excelSerialToDateText(value.v);
  if (value.v instanceof Date) return dateTextFromDate(value.v);
  return undefined;
}

export function fortuneDateCellValue(
  value: string,
  current: FortuneCellValue = { v: "", m: "" },
): FortuneCellValue {
  const serial = dateTextToExcelSerial(value);
  const currentFormat = isDateLikeNumberFormat(current.ct?.fa) ? current.ct?.fa : undefined;
  const format = currentFormat ?? (value.includes(" ") ? "yyyy/m/d h:mm:ss" : "yyyy/m/d");
  const next: FortuneCellValue = {
    ...current,
    v: serial,
    m: excelSerialToDateText(serial) ?? value,
    ct: { ...current.ct, fa: format, t: "d" },
  };
  delete next.f;
  return next;
}

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
