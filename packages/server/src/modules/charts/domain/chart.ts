import { type ChartSpec, parseChartSpec } from "@openexcel/core";

export class ChartStorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ChartStorageError";
  }
}

export class ChartValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChartValidationError";
  }
}

export function serializeChartSpec(spec: ChartSpec): string {
  return JSON.stringify(spec);
}

export function deserializeChartSpec(record: {
  publicId: string;
  workbookId: number;
  sheetId: number;
  spec: string;
}): ChartSpec {
  let raw: unknown;
  try {
    raw = JSON.parse(record.spec);
  } catch (error) {
    throw new ChartStorageError(`Stored chart is not valid JSON: ${record.publicId}`, {
      cause: error,
    });
  }

  try {
    const chart = parseChartSpec(raw);
    if (chart.id !== record.publicId) {
      throw new Error("chart id does not match its public id");
    }
    if (chart.workbookId !== String(record.workbookId)) {
      throw new Error("chart workbook id does not match its relation");
    }
    if (chart.sheetId !== String(record.sheetId)) {
      throw new Error("chart sheet id does not match its relation");
    }
    return chart;
  } catch (error) {
    throw new ChartStorageError(`Stored chart is invalid: ${record.publicId}`, { cause: error });
  }
}

export function parseChartRelationId(value: string, field: string): number {
  if (!/^\d+$/.test(value)) {
    throw new ChartValidationError(`${field} must contain a numeric database id`);
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new ChartValidationError(`${field} must contain a positive database id`);
  }
  return id;
}
