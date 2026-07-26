type ChartMutationRecord = {
  publicId?: unknown;
  workbookId?: unknown;
  sheetId?: unknown;
};

export type CreateChartToolResult = {
  success: true;
  chartId: string;
  workbookId: number;
  sheetId: number;
};

export type UpdateChartToolResult = {
  success: true;
  chartId: string;
};

function asRecord(value: unknown): ChartMutationRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Chart mutation returned an invalid persistence result");
  }
  return value as ChartMutationRecord;
}

function asPositiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Chart mutation returned an invalid ${field}`);
  }
  return value;
}

export function toCreateChartToolResult(value: unknown): CreateChartToolResult {
  const result = asRecord(value);
  if (typeof result.publicId !== "string" || result.publicId.length === 0) {
    throw new Error("Chart mutation returned an invalid chart id");
  }

  return {
    success: true,
    chartId: result.publicId,
    workbookId: asPositiveInteger(result.workbookId, "workbook id"),
    sheetId: asPositiveInteger(result.sheetId, "sheet id"),
  };
}

export function toUpdateChartToolResult(value: unknown, chartId: string): UpdateChartToolResult {
  const result = asRecord(value);
  return {
    success: true,
    chartId: typeof result.publicId === "string" ? result.publicId : chartId,
  };
}
