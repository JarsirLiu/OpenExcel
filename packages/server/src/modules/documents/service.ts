import { type CellRange, cellRangeSize, parseA1Range } from "@openexcel/core";
import {
  type ApplyDocumentLayoutInput,
  type ApplyDocumentOperationInput,
  type ApplyDocumentOperationsInput,
  applyDocumentLayoutSchema,
  applyDocumentOperationSchema,
  applyDocumentOperationsSchema,
  compactDocumentOperationsSchema,
} from "./dto.js";
import * as repository from "./repository.js";

const MAX_RANGE_CELLS = 100_000;

export function parseDocumentRange(reference: string): CellRange {
  return parseA1Range(reference);
}

export async function getSheetInfo(workspaceId: number, sheetId: number) {
  return repository.getDocumentSheetInfo(sheetId, workspaceId);
}

export async function readRange(workspaceId: number, sheetId: number, range: CellRange) {
  if (cellRangeSize(range).rows * cellRangeSize(range).cols > MAX_RANGE_CELLS) {
    return { error: "Requested range is too large" } as const;
  }
  const result = await repository.readDocumentRange(sheetId, workspaceId, range);
  if (!result) return { error: "Sheet not found" } as const;
  return result;
}

export async function applyOperation(workspaceId: number, sheetId: number, input: unknown) {
  const parsed = applyDocumentOperationSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid document operation" } as const;

  const operationInput: ApplyDocumentOperationInput = parsed.data;
  const ranges =
    operationInput.operation.type === "setRangeValues"
      ? [operationInput.operation.range]
      : operationInput.operation.type === "clearRange"
        ? [operationInput.operation.range]
        : operationInput.operation.type === "setCell"
          ? [
              {
                startRow: operationInput.operation.row,
                startCol: operationInput.operation.col,
                endRow: operationInput.operation.row,
                endCol: operationInput.operation.col,
              },
            ]
          : [];
  if (
    ranges.some((range) => {
      const size = cellRangeSize(range);
      return size.rows * size.cols > MAX_RANGE_CELLS;
    })
  ) {
    return { error: "Requested range is too large" } as const;
  }

  const result = await repository.applyStoredDocumentOperation(
    sheetId,
    workspaceId,
    operationInput.operation,
    operationInput.expectedRevision,
    undefined,
    operationInput.styles,
    operationInput.batchId,
    operationInput.idempotencyKey,
  );
  if (!result) return { error: "Sheet not found" } as const;
  if ("idempotencyConflict" in result) {
    return { error: "Idempotency key conflict", ...result } as const;
  }
  if ("conflict" in result) return { error: "Revision conflict", ...result } as const;
  return result;
}

export async function applyOperations(
  workspaceId: number,
  sheetId: number,
  input: unknown,
  runId?: number,
) {
  const parsed = applyDocumentOperationsSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid document operations" } as const;

  const operationInput: ApplyDocumentOperationsInput = parsed.data;
  let totalCells = 0;
  for (const operation of operationInput.operations) {
    const range =
      operation.type === "setRangeValues" || operation.type === "clearRange"
        ? operation.range
        : operation.type === "setCell"
          ? {
              startRow: operation.row,
              startCol: operation.col,
              endRow: operation.row,
              endCol: operation.col,
            }
          : null;
    if (range) {
      const size = cellRangeSize(range);
      totalCells += size.rows * size.cols;
      if (totalCells > MAX_RANGE_CELLS) {
        return { error: "Requested operations are too large" } as const;
      }
    }
  }

  const result = await repository.applyStoredDocumentOperations(
    sheetId,
    workspaceId,
    operationInput.operations,
    operationInput.expectedRevision,
    runId,
    operationInput.styles,
    operationInput.batchId,
    operationInput.idempotencyKey,
  );
  if (!result) return { error: "Sheet not found" } as const;
  if ("idempotencyConflict" in result) {
    return { error: "Idempotency key conflict", ...result } as const;
  }
  if ("conflict" in result) return { error: "Revision conflict", ...result } as const;
  return result;
}

export async function applyLayout(workspaceId: number, sheetId: number, input: unknown) {
  const parsed = applyDocumentLayoutSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid document layout" } as const;
  const layoutInput: ApplyDocumentLayoutInput = parsed.data;
  const result = await repository.updateDocumentLayout(
    sheetId,
    workspaceId,
    layoutInput.config,
    layoutInput.expectedRevision,
    layoutInput.batchId,
    layoutInput.idempotencyKey,
  );
  if (!result) return { error: "Sheet not found" } as const;
  if ("idempotencyConflict" in result) {
    return { error: "Idempotency key conflict", ...result } as const;
  }
  if ("conflict" in result) return { error: "Revision conflict", ...result } as const;
  return result;
}

export async function compactOperations(workspaceId: number, sheetId: number, input: unknown) {
  const parsed = compactDocumentOperationsSchema.safeParse(input ?? {});
  if (!parsed.success) return { error: "Invalid document compaction request" } as const;

  const result = await repository.compactStoredDocumentOperations(
    sheetId,
    workspaceId,
    parsed.data.expectedRevision,
  );
  if (!result) return { error: "Sheet not found" } as const;
  if ("conflict" in result) return { error: "Revision conflict", ...result } as const;
  return result;
}
