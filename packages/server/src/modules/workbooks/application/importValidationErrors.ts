export type ImportValidationCode = "INVALID_IMPORT_PAYLOAD" | "IMPORT_LIMIT_EXCEEDED";

export class ImportValidationError extends Error {
  constructor(
    message: string,
    readonly code: ImportValidationCode,
    readonly statusCode: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ImportValidationError";
  }
}
