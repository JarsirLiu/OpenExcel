import type {
  CanonicalCellStyle,
  DocumentMutation,
  DocumentStyleDefinition,
} from "@openexcel/core";
import { apiFetch, readErrorMessage } from "./http";

export interface DocumentRangeCell {
  row: number;
  col: number;
  value: {
    value: string | number | boolean | null;
    displayValue?: string;
    formula?: string;
    styleId?: string;
    metadata?: Record<string, unknown>;
  };
}

export interface DocumentRangeResult {
  sheetId: number;
  format: string;
  version: number;
  revision: number;
  maxRow: number;
  maxColumn: number;
  range: { startRow: number; startCol: number; endRow: number; endCol: number };
  cells: DocumentRangeCell[];
  styles?: Record<string, CanonicalCellStyle>;
  objects: Array<{
    id: string;
    type: "chart" | "image" | "comment" | "custom";
    position: Record<string, unknown>;
    data: Record<string, unknown>;
  }>;
}

export interface CalculatedCell {
  sheetName: string;
  row: number;
  col: number;
  value: string | number | boolean | null;
  formula?: string;
  error?: string;
}

export interface DocumentMutationResponse {
  batchId: string;
  revision: number;
  changedRanges: unknown[];
  objectIds: string[];
  calculatedCells: CalculatedCell[];
}

export class DocumentRevisionConflictError extends Error {
  readonly currentRevision: number;
  readonly changedRanges: DocumentMutation["changedRanges"];

  constructor(currentRevision: number, changedRanges: DocumentMutation["changedRanges"] = []) {
    super("Revision conflict");
    this.name = "DocumentRevisionConflictError";
    this.currentRevision = currentRevision;
    this.changedRanges = changedRanges;
  }
}

async function throwDocumentMutationError(res: Response, fallback: string): Promise<never> {
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error(fallback);
  }
  if (
    res.status === 409 &&
    typeof data === "object" &&
    data !== null &&
    (data as Record<string, unknown>).error === "Revision conflict" &&
    typeof (data as Record<string, unknown>).currentRevision === "number"
  ) {
    const body = data as Record<string, unknown>;
    throw new DocumentRevisionConflictError(
      body.currentRevision as number,
      Array.isArray(body.changedRanges)
        ? (body.changedRanges as DocumentMutation["changedRanges"])
        : [],
    );
  }
  if (
    typeof data === "object" &&
    data !== null &&
    typeof (data as Record<string, unknown>).error === "string"
  ) {
    throw new Error((data as Record<string, unknown>).error as string);
  }
  throw new Error(fallback);
}

export async function fetchDocumentRange(
  workspaceId: number,
  sheetId: number,
  range: string,
): Promise<DocumentRangeResult> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/sheets/${sheetId}/document/range?range=${encodeURIComponent(range)}`,
  );
  if (!res.ok) throw new Error(await readErrorMessage(res, "读取文档范围失败"));
  return res.json();
}

export async function applyDocumentOperation(
  workspaceId: number,
  sheetId: number,
  operation: unknown,
  expectedRevision?: number,
  styles?: DocumentStyleDefinition[],
  batchId?: string,
  idempotencyKey?: string,
): Promise<DocumentMutationResponse> {
  const res = await apiFetch(`/workspaces/${workspaceId}/sheets/${sheetId}/document/operations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation, expectedRevision, styles, batchId, idempotencyKey }),
  });
  if (!res.ok) await throwDocumentMutationError(res, "保存文档操作失败");
  return res.json();
}

export async function applyDocumentOperations(
  workspaceId: number,
  sheetId: number,
  operations: unknown[],
  expectedRevision?: number,
  styles?: DocumentStyleDefinition[],
  batchId?: string,
  idempotencyKey?: string,
): Promise<DocumentMutationResponse> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/sheets/${sheetId}/document/operations/batch`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operations, expectedRevision, styles, batchId, idempotencyKey }),
    },
  );
  if (!res.ok) await throwDocumentMutationError(res, "保存文档操作失败");
  return res.json();
}

export async function applyDocumentLayout(
  workspaceId: number,
  sheetId: number,
  config: unknown,
  expectedRevision?: number,
  batchId?: string,
  idempotencyKey?: string,
): Promise<DocumentMutationResponse> {
  const res = await apiFetch(`/workspaces/${workspaceId}/sheets/${sheetId}/document/layout`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config, expectedRevision, batchId, idempotencyKey }),
  });
  if (!res.ok) await throwDocumentMutationError(res, "保存文档布局失败");
  return res.json();
}
