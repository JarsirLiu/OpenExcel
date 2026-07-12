export type SheetInitializationPayload = {
  columns: string;
  merges: string;
  uploadedData: string;
  config?: string;
  maxRow: number;
  maxColumn: number;
};

export type SourceSheetPayload = {
  columns: string;
  merges: string;
  uploadedData: string | null;
  config: string | null;
  maxRow?: number;
  maxColumn?: number;
};

export class WorkbookCreationError extends Error {
  statusCode: number;
  code: "SOURCE_SHEET_NOT_FOUND";

  constructor(message: string, code: "SOURCE_SHEET_NOT_FOUND", statusCode = 400) {
    super(message);
    this.name = "WorkbookCreationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function normalizeWorkbookName(name?: string) {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "New Workbook";
}

export function normalizeSheetName(name: string | undefined, fallbackIndex: number) {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : `Sheet${fallbackIndex}`;
}

export function buildBlankSheetInitialization(): SheetInitializationPayload {
  return {
    columns: JSON.stringify([]),
    merges: JSON.stringify([]),
    uploadedData: JSON.stringify([]),
    maxRow: 0,
    maxColumn: 0,
  };
}

export function buildSourceSheetInitialization(
  sourceSheet: SourceSheetPayload,
): SheetInitializationPayload {
  const payload: SheetInitializationPayload = {
    columns: sourceSheet.columns,
    merges: sourceSheet.merges,
    uploadedData: sourceSheet.uploadedData ?? JSON.stringify([]),
    maxRow: sourceSheet.maxRow ?? 0,
    maxColumn: sourceSheet.maxColumn ?? 0,
  };

  if (sourceSheet.config != null) {
    payload.config = sourceSheet.config;
  }

  return payload;
}
