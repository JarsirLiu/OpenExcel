import {
  type ImportedWorkbookBatchInput,
  parseSpreadsheetFile,
  XlsxSafetyLimitError,
} from "@openexcel/core";
import type { AssetService } from "../../assets/application/assetService.js";
import type { AssetRecord } from "../../assets/domain/asset.js";
import type { AssetImportActivator } from "../../assets/domain/assetRepository.js";
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
  sourceAsset?: AssetRecord,
  activateAsset?: AssetImportActivator,
) {
  try {
    const parsedWorkbooks = normalizeImportedBatch(input);
    return sourceAsset
      ? repo.createImportedWorkbooks(workspaceId, parsedWorkbooks, sourceAsset, activateAsset)
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
  sourceAsset: AssetRecord,
  assets: AssetService,
) {
  let importStarted = false;
  try {
    const importingAsset = await assets.beginImport(sourceAsset.id, workspaceId);
    importStarted = true;
    return await assets.withAssetLease(importingAsset.id, async () => {
      const bytes = await assets.read(importingAsset);
      const workbook = await parseSpreadsheetFile({
        fileName: importingAsset.originalFileName,
        format: importingAsset.detectedFormat,
        bytes,
      });
      return importWorkbooks(
        workspaceId,
        { workbooks: [workbook] },
        importingAsset,
        assets.completeImport,
      );
    });
  } catch (error) {
    if (importStarted) {
      await assets
        .markOrphaned(sourceAsset.id, error instanceof Error ? error.message : "Excel 导入失败")
        .catch(() => undefined);
    }
    if (error instanceof ImportValidationError) {
      throw new WorkbookImportError(error.message, error.code, error.statusCode, error.details);
    }
    if (error instanceof WorkbookImportError) throw error;
    const limitExceeded = error instanceof XlsxSafetyLimitError;
    throw new WorkbookImportError(
      error instanceof Error ? `Excel 文件解析失败：${error.message}` : "Excel 文件解析失败",
      limitExceeded ? "IMPORT_LIMIT_EXCEEDED" : "INVALID_IMPORT_PAYLOAD",
      limitExceeded ? 413 : 400,
    );
  }
}
