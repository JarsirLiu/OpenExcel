import {
  fetchMessages,
  fetchRunEvents,
  fetchRuns,
  type RunEvent,
  type RunSnapshot,
} from "@/api/chat";

export type RunRecoveryCursor = {
  runId: number;
  after: number;
};

export type RunRecoveryResult = {
  snapshot: RunSnapshot;
  events: RunEvent[];
  messages: any[] | null;
  cursor: RunRecoveryCursor;
};

export class RunRecoveryTimeoutError extends Error {
  constructor(runId: number) {
    super(`运行 ${runId} 在恢复轮询期限内仍未结束`);
    this.name = "RunRecoveryTimeoutError";
  }
}

export async function findActiveRunCursor(
  workspaceId: number,
  sessionId: number,
): Promise<RunRecoveryCursor | null> {
  const runs = await fetchRuns(workspaceId, sessionId);
  const activeRun = [...runs].reverse().find((run) => run?.status === "running");
  const runId = Number(activeRun?.id);
  return Number.isInteger(runId) && runId > 0 ? { runId, after: -1 } : null;
}

export function readRunId(response: Response): number | null {
  const value = Number(response.headers.get("X-OpenExcel-Run-Id"));
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function advanceRunCursor(cursor: RunRecoveryCursor, events: RunEvent[]): RunRecoveryCursor {
  const newestSequence = events.reduce(
    (sequence, event) => Math.max(sequence, event.sequence),
    cursor.after,
  );
  return newestSequence <= cursor.after ? cursor : { ...cursor, after: newestSequence };
}

export async function recoverRunOnce(
  workspaceId: number,
  sessionId: number,
  cursor: RunRecoveryCursor,
  options?: { signal?: AbortSignal },
): Promise<RunRecoveryResult> {
  const page = await fetchRunEvents(
    workspaceId,
    sessionId,
    cursor.runId,
    cursor.after,
    200,
    options,
  );
  const nextCursor = advanceRunCursor(cursor, page.events);
  const messages = page.run.terminal
    ? (await fetchMessages(workspaceId, sessionId, 200, 0, options)).messages
    : null;

  return {
    snapshot: page.run,
    events: page.events,
    messages,
    cursor: nextCursor,
  };
}

export async function recoverRunUntilTerminal(
  workspaceId: number,
  sessionId: number,
  cursor: RunRecoveryCursor,
  options?: {
    signal?: AbortSignal;
    attempts?: number;
    delayMs?: number;
    onUpdate?: (result: RunRecoveryResult) => void | Promise<void>;
  },
): Promise<RunRecoveryResult> {
  const attempts = options?.attempts ?? 30;
  const delayMs = options?.delayMs ?? 500;
  let current = cursor;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await recoverRunOnce(workspaceId, sessionId, current, options);
    current = result.cursor;
    await options?.onUpdate?.(result);
    if (result.snapshot.terminal) return result;
    if (attempt + 1 < attempts) await wait(delayMs, options?.signal);
  }

  throw new RunRecoveryTimeoutError(cursor.runId);
}

function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("The operation was aborted", "AbortError"));
      return;
    }

    const timer = window.setTimeout(resolve, delayMs);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(signal.reason ?? new DOMException("The operation was aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
