import type { ContextUsageSnapshot } from "@/features/chat/context/contextUsage";
import { apiFetch, readErrorMessage } from "./http";

export type ChatMessagesPage = {
  messages: any[];
  total: number;
};

export async function fetchContextUsage(
  workspaceId: number,
  sessionId: number,
  options?: { signal?: AbortSignal },
): Promise<ContextUsageSnapshot> {
  const res = await apiFetch(`/workspaces/${workspaceId}/sessions/${sessionId}/context-usage`, {
    signal: options?.signal,
  });
  if (!res.ok) throw new Error("加载上下文用量失败");
  return res.json();
}

export async function fetchMessages(
  workspaceId: number,
  sessionId: number,
  limit = 40,
  offset = 0,
  options?: { signal?: AbortSignal },
): Promise<ChatMessagesPage> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/sessions/${sessionId}/messages?limit=${limit}&offset=${offset}`,
    { signal: options?.signal },
  );
  if (!res.ok) throw new Error("加载消息失败");
  return res.json();
}

export async function cancelRun(
  workspaceId: number,
  sessionId: number,
  runId: number,
): Promise<{ runId: number; status: string; cancelRequested: boolean }> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/sessions/${sessionId}/runs/${runId}/cancel`,
    { method: "POST" },
  );
  if (!res.ok) throw new Error(await readErrorMessage(res, "中断运行失败"));
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
