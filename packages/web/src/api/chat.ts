import { apiFetch } from "./http";

export async function fetchMessages(sessionId: number): Promise<any[]> {
  const res = await apiFetch(`/sessions/${sessionId}/messages`);
  if (!res.ok) throw new Error("加载消息失败");
  return res.json();
}

export async function fetchRuns(sessionId: number): Promise<any[]> {
  const res = await apiFetch(`/sessions/${sessionId}/runs`);
  if (!res.ok) throw new Error("加载运行日志失败");
  return res.json();
}

export async function undoLatestRun(sessionId: number): Promise<{ runId: number; restoredSheetIds: number[] }> {
  const res = await apiFetch(`/sessions/${sessionId}/runs/undo-latest`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("撤销本轮修改失败");
  return res.json();
}
