import type { ImportedWorkbookBatchInput } from "@openexcel/core";
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

export async function importWorkbooks(workspaceId: number, input: ImportedWorkbookBatchInput) {
  try {
    const parsedWorkbooks = normalizeImportedBatch(input);
    return await repo.createImportedWorkbooks(workspaceId, parsedWorkbooks);
  } catch (error) {
    if (error instanceof ImportValidationError) {
      throw new WorkbookImportError(error.message, error.code, error.statusCode, error.details);
    }
    throw error;
  }
}
