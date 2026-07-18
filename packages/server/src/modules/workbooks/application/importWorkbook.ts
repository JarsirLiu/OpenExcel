import { type ImportedWorkbookBatchInput, parseSpreadsheetFile } from "@openexcel/core";
import type { WorkbookSourceAsset } from "../domain/sourceAsset.js";
import type { WorkbookSourceAssetStorage } from "../domain/sourceAssetStorage.js";
import * as repo from "../infrastructure/workbookRepository.js";
import { ImportValidationError } from "./importValidationErrors.js";
import { normalizeImportedBatch } from "./importWorkbookValidation.js";

export type WorkbookImportErrorCode = "INVALID_IMPORT_PAYLOAD" | "IMPORT_LIMIT_EXCEEDED";

export class WorkbookImportError extends Error {
  statusCode: number;
  code: WorkbookImportErrorCode;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    code: WorkbookImportErrorCode,
    statusCode = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "WorkbookImportError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export async function importWorkbooks(
  workspaceId: number,
  input: ImportedWorkbookBatchInput,
  sourceAsset?: WorkbookSourceAsset,
) {
  try {
    const parsedWorkbooks = normalizeImportedBatch(input);
    return sourceAsset
      ? repo.createImportedWorkbooks(workspaceId, parsedWorkbooks, sourceAsset)
      : repo.createImportedWorkbooks(workspaceId, parsedWorkbooks);
  } catch (error) {
    if (error instanceof ImportValidationError) {
      throw new WorkbookImportError(error.message, error.code, error.statusCode, error.details);
    }
    throw error;
  }
}

export async function importStoredWorkbook(
  workspaceId: number,
  sourceAsset: WorkbookSourceAsset,
  sourceAssetStorage: WorkbookSourceAssetStorage,
) {
  const bytes = await sourceAssetStorage.read(sourceAsset.storageKey);
  let workbook: ImportedWorkbookBatchInput["workbooks"][number];
  try {
    workbook = await parseSpreadsheetFile({
      fileName: sourceAsset.originalFileName,
      format: sourceAsset.detectedFormat,
      bytes,
    });
  } catch (error) {
    throw new WorkbookImportError(
      error instanceof Error ? `Excel 文件解析失败：${error.message}` : "Excel 文件解析失败",
      "INVALID_IMPORT_PAYLOAD",
      400,
    );
  }

  return importWorkbooks(workspaceId, { workbooks: [workbook] }, sourceAsset);
}
