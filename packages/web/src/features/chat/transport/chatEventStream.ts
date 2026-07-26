export type ChatEvent = {
  eventId: string;
  sequence: number;
  type:
    | "run.started"
    | "step.started"
    | "message.delta"
    | "reasoning.delta"
    | "tool.started"
    | "tool.finished"
    | "step.finished"
    | "run.completed"
    | "run.cancelled"
    | "run.failed";
  occurredAt: string;
  payload: unknown;
};

export async function* openChatEventStream(options: {
  api: string;
  body: unknown;
  signal: AbortSignal;
  onRunId?: (runId: number) => void;
}): AsyncGenerator<ChatEvent> {
  const response = await fetch(options.api, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(options.body),
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error((await response.text()) || "发送聊天消息失败");
  }

  const runId = Number(response.headers.get("X-OpenExcel-Run-Id"));
  if (Number.isInteger(runId) && runId > 0) options.onRunId?.(runId);

  if (!response.body) throw new Error("聊天响应没有可读取的事件流");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        yield parseChatEvent(trimmed);
      }
      if (done) break;
    }

    const trailing = buffer.trim();
    if (trailing) yield parseChatEvent(trailing);
  } finally {
    reader.releaseLock();
  }
}

function parseChatEvent(line: string): ChatEvent {
  const event = JSON.parse(line) as Partial<ChatEvent>;
  if (
    typeof event.eventId !== "string" ||
    typeof event.sequence !== "number" ||
    typeof event.type !== "string" ||
    typeof event.occurredAt !== "string"
  ) {
    throw new Error("聊天事件流格式无效");
  }
  return event as ChatEvent;
}
