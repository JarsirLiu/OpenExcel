import { apiFetch, readErrorMessage } from "./http";

export type RunSnapshot = {
  runId: number;
  status: string;
  requestId: string | null;
  startedAt: string;
  endedAt: string | null;
  outputText: string | null;
  errorMessage: string | null;
  cancelRequested: boolean;
  terminal: boolean;
  lastEventSequence: number;
};

export type RunEvent = {
  eventId: string;
  sequence: number;
  type: string;
  occurredAt: string;
  payload: unknown;
};

export type RunEventPage = {
  run: RunSnapshot;
  events: RunEvent[];
  cursor: {
    after: number;
    lastEventSequence: number;
  };
  hasMore: boolean;
};

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

export async function fetchRunSnapshot(
  workspaceId: number,
  sessionId: number,
  runId: number,
  options?: { signal?: AbortSignal },
): Promise<RunSnapshot> {
  const res = await apiFetch(`/workspaces/${workspaceId}/sessions/${sessionId}/runs/${runId}`, {
    signal: options?.signal,
  });
  if (!res.ok) throw new Error("加载运行状态失败");
  return res.json();
}

export async function fetchRunEvents(
  workspaceId: number,
  sessionId: number,
  runId: number,
  after = -1,
  limit = 200,
  options?: { signal?: AbortSignal },
): Promise<RunEventPage> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/sessions/${sessionId}/runs/${runId}/events?after=${after}&limit=${limit}`,
    { signal: options?.signal },
  );
  if (!res.ok) throw new Error("加载运行事件失败");
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
