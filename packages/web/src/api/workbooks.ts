import { API_BASE, apiFetch, readErrorMessage } from "./http";

export interface WorkbookMeta {
  id: number;
  name: string;
  order: number;
}

export interface WorkbookReferenceCandidateSheet {
  id: number;
  name: string;
}

export interface WorkbookReferenceCandidate {
  id: number;
  name: string;
  sheets: WorkbookReferenceCandidateSheet[];
}

export interface SheetSchema {
  id: number;
  name: string;
  order: number;
  columns: { label: string; width?: number }[];
  merges: { row: [number, number]; col: [number, number] }[];
  uploadedData: any[] | null;
  config: any | null;
}

export interface WorkbookFull {
  id: number;
  name: string;
  sheets: SheetSchema[];
}

export interface WorkbookImportResult {
  success: true;
  workbookId: number;
  workbookName: string;
  updatedSheets: { id: number; name: string; rows: number; cols: number }[];
  skippedCurrentSheets: string[];
  ignoredUploadedSheets: string[];
}

export interface WorkbookCreateResult {
  id: number;
  name: string;
  order: number;
  sheets: number;
  initialSheet: {
    id: number;
    name: string;
    order: number;
  };
}

export async function fetchWorkbooks(workspaceId: number): Promise<WorkbookMeta[]> {
  const res = await apiFetch(`/workspaces/${workspaceId}/workbooks`);
  if (!res.ok) throw new Error("加载工作簿失败");
  return res.json();
}

export async function fetchWorkbookReferenceCandidates(
  workspaceId: number,
  options?: { signal?: AbortSignal },
): Promise<WorkbookReferenceCandidate[]> {
  const res = await apiFetch(`/workspaces/${workspaceId}/workbooks/reference-candidates`, options?.signal ? { signal: options.signal } : {});
  if (!res.ok) throw new Error("加载引用候选失败");
  return res.json();
}

export async function fetchWorkbook(workspaceId: number, id: number): Promise<WorkbookFull> {
  const res = await apiFetch(`/workspaces/${workspaceId}/workbooks/${id}`);
  if (!res.ok) throw new Error("加载工作簿详情失败");
  return res.json();
}

export async function uploadExcel(workspaceId: number, workbookId: number, file: File): Promise<WorkbookImportResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await apiFetch(`/workspaces/${workspaceId}/workbooks/${workbookId}/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "导入失败"));
  return res.json();
}

export async function uploadNewWorkbook(workspaceId: number, file: File): Promise<{ id: number; name: string; sheets: number }> {
  const form = new FormData();
  form.append("file", file);
  const res = await apiFetch(`/workspaces/${workspaceId}/workbooks/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "上传工作簿失败"));
  return res.json();
}

export async function createWorkbook(
  workspaceId: number,
  input?: {
  name?: string;
  sheetName?: string;
  sourceSheetId?: number;
  },
): Promise<WorkbookCreateResult> {
  const res = await apiFetch(`/workspaces/${workspaceId}/workbooks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input?.name,
      sheetName: input?.sheetName,
      sourceSheetId: input?.sourceSheetId,
    }),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "新建工作簿失败"));
  return res.json();
}

export function downloadTemplateUrl(workspaceId: number, workbookId: number): string {
  return `${API_BASE}/workspaces/${workspaceId}/workbooks/${workbookId}/template`;
}

export async function updateSheetData(workspaceId: number, sheetId: number, celldata: any[], config?: any): Promise<void> {
  const body: any = { celldata };
  if (config !== undefined) body.config = config;
  const res = await apiFetch(`/workspaces/${workspaceId}/sheets/${sheetId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("保存失败");
}

export async function createSheet(
  workspaceId: number,
  workbookId: number,
  input?: { name?: string; sourceSheetId?: number },
): Promise<{ workbookId: number; id: number; name: string; order: number }> {
  const res = await apiFetch(`/workspaces/${workspaceId}/workbooks/${workbookId}/sheets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {}),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "创建 Sheet 失败"));
  return res.json();
}

export async function deleteWorkbook(workspaceId: number, id: number): Promise<void> {
  const res = await apiFetch(`/workspaces/${workspaceId}/workbooks/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await readErrorMessage(res, "删除工作簿失败"));
}

export async function deleteSheet(workspaceId: number, workbookId: number, sheetId: number): Promise<void> {
  const res = await apiFetch(`/workspaces/${workspaceId}/workbooks/${workbookId}/sheets/${sheetId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "删除 Sheet 失败"));
}
