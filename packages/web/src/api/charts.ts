import type { ChartSpec } from "@openexcel/core";
import { apiFetch, readErrorMessage } from "./http";

export async function createChart(
  workspaceId: number,
  workbookId: number,
  input: Omit<ChartSpec, "id">,
): Promise<ChartSpec> {
  const res = await apiFetch(`/workspaces/${workspaceId}/workbooks/${workbookId}/charts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "创建图表失败"));
  return res.json();
}

export async function updateChart(
  workspaceId: number,
  chartId: string,
  patch: Partial<Pick<ChartSpec, "type" | "title" | "sheetId" | "anchor" | "series">>,
): Promise<ChartSpec> {
  const res = await apiFetch(`/workspaces/${workspaceId}/charts/${chartId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "更新图表失败"));
  return res.json();
}

export async function deleteChart(workspaceId: number, chartId: string): Promise<void> {
  const res = await apiFetch(`/workspaces/${workspaceId}/charts/${chartId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "删除图表失败"));
}
