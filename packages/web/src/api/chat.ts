import { apiFetch } from "./http";

export async function fetchMessages(
  workspaceId: number,
  sessionId: number,
  limit = 40,
  offset = 0,
  options?: { signal?: AbortSignal },
): Promise<{ messages: any[]; total: number }> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/sessions/${sessionId}/messages?limit=${limit}&offset=${offset}`,
    { signal: options?.signal },
  );
  if (!res.ok) throw new Error("加载消息失败");
  return res.json();
}

export async function fetchRuns(workspaceId: number, sessionId: number): Promise<any[]> {
  const res = await apiFetch(`/workspaces/${workspaceId}/sessions/${sessionId}/runs`);
  if (!res.ok) throw new Error("加载运行日志失败");
  return res.json();
}

export async function fetchUndoAvailability(
  workspaceId: number,
  sessionId: number,
): Promise<{ canUndo: boolean }> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/sessions/${sessionId}/runs/undo-availability`,
  );
  if (!res.ok) throw new Error("加载撤销状态失败");
  return res.json();
}

export async function undoLatestRun(
  workspaceId: number,
  sessionId: number,
): Promise<{ runId: number; restoredSheetIds: number[]; undoneUserText: string }> {
  const res = await apiFetch(`/workspaces/${workspaceId}/sessions/${sessionId}/runs/undo-latest`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("撤销本轮修改失败");
  return res.json();
}
