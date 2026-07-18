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
