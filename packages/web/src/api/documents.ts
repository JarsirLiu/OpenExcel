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
): Promise<{
  revision: number;
  changedRanges: unknown[];
  objectIds: string[];
  calculatedCells: CalculatedCell[];
}> {
  const res = await apiFetch(`/workspaces/${workspaceId}/sheets/${sheetId}/document/operations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation, expectedRevision }),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "保存文档操作失败"));
  return res.json();
}

export async function applyDocumentOperations(
  workspaceId: number,
  sheetId: number,
  operations: unknown[],
  expectedRevision?: number,
): Promise<{
  revision: number;
  changedRanges: unknown[];
  objectIds: string[];
  calculatedCells: CalculatedCell[];
}> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/sheets/${sheetId}/document/operations/batch`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operations, expectedRevision }),
    },
  );
  if (!res.ok) throw new Error(await readErrorMessage(res, "保存文档操作失败"));
  return res.json();
}

export async function applyDocumentLayout(
  workspaceId: number,
  sheetId: number,
  config: unknown,
  expectedRevision?: number,
): Promise<{ revision: number; calculatedCells: CalculatedCell[] }> {
  const res = await apiFetch(`/workspaces/${workspaceId}/sheets/${sheetId}/document/layout`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config, expectedRevision }),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "保存文档布局失败"));
  return res.json();
}
