import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConversationStore } from "../conversation/conversationStore";
import { useChatConversation } from "./useChatConversation";

describe("ConversationStore", () => {
  it("deduplicates a repeated sequence even when its event id changes", () => {
    const store = new ConversationStore();

    store.applyEvent({
      runId: 7,
      eventId: "event-1",
      sequence: 1,
      type: "message.delta",
      occurredAt: "2026-07-26T00:00:00.000Z",
      payload: { messageId: "assistant-1", partId: "text-1", delta: "答" },
    });
    store.applyEvent({
      runId: 7,
      eventId: "event-replayed-with-new-id",
      sequence: 1,
      type: "message.delta",
      occurredAt: "2026-07-26T00:00:00.000Z",
      payload: { messageId: "assistant-1", partId: "text-1", delta: "错误" },
    });

    expect(store.messages.at(-1)?.parts?.[0]).toMatchObject({ text: "答" });
  });

  it("projects compaction lifecycle events without adding a transcript message", () => {
    const store = new ConversationStore();
    const event = (type: "context.compaction.started" | "context.compaction.completed") => ({
      eventId: `event-${type}`,
      sequence: type.endsWith("started") ? 1 : 2,
      type,
      occurredAt: "2026-07-26T00:00:00.000Z",
      payload: {},
    });

    store.applyEvent(event("context.compaction.started"));
    expect(store.compactionStatus).toBe("running");
    expect(store.messages).toEqual([]);

    store.applyEvent(event("context.compaction.completed"));
    expect(store.compactionStatus).toBe("completed");
    expect(store.messages).toEqual([]);
  });

  it("projects the latest step context usage without adding a message", () => {
    const store = new ConversationStore();
    store.setContextUsage({
      contextWindowTokens: 1_000_000,
      usedTokens: 100_000,
      estimatedContextTokens: 100_100,
      percentage: 10,
      source: "none",
      runId: null,
      updatedAt: null,
    });

    store.applyEvent({
      runId: 7,
      eventId: "event-step-start",
      sequence: 1,
      type: "step.started",
      occurredAt: "2026-07-27T00:00:01.000Z",
      payload: {
        tokenObservation: { inputTokens: 159900, source: "mixed" },
        estimatedContextTokens: 160100,
      },
    });

    expect(store.contextUsage).toMatchObject({
      usedTokens: 159900,
      estimatedContextTokens: 160100,
      source: "mixed",
      runId: 7,
    });
    expect(store.messages).toEqual([]);
  });

  it("keeps equal sequences from different runs independent", () => {
    const store = new ConversationStore();

    for (const [runId, messageId, delta] of [
      [7, "assistant-7", "甲"],
      [8, "assistant-8", "乙"],
    ] as const) {
      store.applyEvent({
        runId,
        eventId: `event-${runId}`,
        sequence: 1,
        type: "message.delta",
        occurredAt: "2026-07-26T00:00:00.000Z",
        payload: { messageId, partId: `text-${runId}`, delta },
      });
    }

    expect(store.messages.map((message) => message.id)).toEqual(["assistant-7", "assistant-8"]);
  });

  it("projects confirmed AgentEvents into one assistant message", () => {
    const store = new ConversationStore([
      { id: "user-1", role: "user", parts: [{ type: "text", text: "你好" }] },
    ]);

    store.applyEvent({
      eventId: "event-1",
      sequence: 1,
      type: "message.delta",
      occurredAt: "2026-07-26T00:00:00.000Z",
      payload: { messageId: "assistant-1", partId: "text-1", delta: "答" },
    });
    store.applyEvent({
      eventId: "event-2",
      sequence: 2,
      type: "message.delta",
      occurredAt: "2026-07-26T00:00:00.001Z",
      payload: { messageId: "assistant-1", partId: "text-1", delta: "案" },
    });

    expect(store.messages.at(-1)).toEqual({
      id: "assistant-1",
      role: "assistant",
      parts: [{ id: "text-1", type: "text", text: "答案" }],
    });
  });

  it("keeps tool cards and later step text in the same assistant message", () => {
    const store = new ConversationStore([
      { id: "user-1", role: "user", parts: [{ type: "text", text: "读取数据" }] },
    ]);

    store.applyEvent({
      eventId: "event-text-1",
      sequence: 1,
      type: "message.delta",
      occurredAt: "2026-07-26T00:00:00.000Z",
      payload: {
        turnId: "turn-1",
        stepIndex: 1,
        messageId: "turn-1-assistant",
        partId: "turn-1-text-1",
        delta: "先读取。",
      },
    });
    store.applyEvent({
      eventId: "event-tool-start",
      sequence: 2,
      type: "tool.started",
      occurredAt: "2026-07-26T00:00:00.001Z",
      payload: {
        turnId: "turn-1",
        stepIndex: 1,
        messageId: "turn-1-assistant",
        toolCallId: "call-1",
        toolName: "readSheetData",
        input: { sheetId: 1 },
      },
    });
    store.applyEvent({
      eventId: "event-tool-finish",
      sequence: 3,
      type: "tool.finished",
      occurredAt: "2026-07-26T00:00:00.002Z",
      payload: {
        turnId: "turn-1",
        stepIndex: 1,
        messageId: "turn-1-assistant",
        toolCallId: "call-1",
        toolName: "readSheetData",
        input: { sheetId: 1 },
        output: { cells: [[1]] },
      },
    });
    store.applyEvent({
      eventId: "event-text-2",
      sequence: 4,
      type: "message.delta",
      occurredAt: "2026-07-26T00:00:00.003Z",
      payload: {
        turnId: "turn-1",
        stepIndex: 2,
        messageId: "turn-1-assistant",
        partId: "turn-1-text-2",
        delta: "读取完成。",
      },
    });

    expect(store.messages).toHaveLength(2);
    expect(store.messages[1]).toMatchObject({
      id: "turn-1-assistant",
      role: "assistant",
      parts: [
        { type: "text", text: "先读取。" },
        { type: "tool-readSheetData", state: "output-available" },
        { type: "text", text: "读取完成。" },
      ],
    });
  });

  it("closes pending tool cards when the run reaches a terminal state", () => {
    const store = new ConversationStore();

    store.applyEvent({
      eventId: "event-tool-start",
      sequence: 1,
      type: "tool.started",
      occurredAt: "2026-07-26T00:00:00.000Z",
      payload: {
        messageId: "assistant-1",
        toolCallId: "call-1",
        toolName: "writeCells",
        input: {},
      },
    });
    store.applyEvent({
      eventId: "event-run-cancelled",
      sequence: 2,
      type: "run.cancelled",
      occurredAt: "2026-07-26T00:00:00.001Z",
      payload: {},
    });

    expect(store.messages[0]).toMatchObject({
      parts: [
        {
          type: "tool-writeCells",
          state: "output-error",
          errorText: "工具执行已中断",
        },
      ],
    });
  });
});

describe("useChatConversation", () => {
  it("keeps the newly created session stream after event-driven rerenders", async () => {
    const originalFetch = globalThis.fetch;
    const randomUUID = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValue("00000000-0000-4000-8000-000000000001");
    const chunks = [
      {
        eventId: "event-1",
        sequence: 0,
        type: "run.started",
        occurredAt: "2026-07-26T00:00:00.000Z",
        payload: {
          userMessage: {
            id: "00000000-0000-4000-8000-000000000001",
            role: "user",
            parts: [{ type: "text", text: "你是谁" }],
          },
        },
      },
      {
        eventId: "event-2",
        sequence: 1,
        type: "message.delta",
        occurredAt: "2026-07-26T00:00:00.001Z",
        payload: {
          messageId: "assistant-1",
          partId: "text-1",
          delta: "你好",
        },
      },
      {
        eventId: "event-3",
        sequence: 2,
        type: "run.completed",
        occurredAt: "2026-07-26T00:00:00.002Z",
        payload: {},
      },
    ];

    globalThis.fetch = async (input) => {
      if (String(input).endsWith("/title")) {
        return new Response(JSON.stringify({ title: "身份确认" }), {
          headers: { "content-type": "application/json" },
        });
      }
      if (String(input).includes("/context-usage")) {
        return new Response(
          JSON.stringify({
            contextWindowTokens: 180_000,
            usedTokens: 0,
            estimatedContextTokens: null,
            percentage: 0,
            source: "none",
            runId: null,
            updatedAt: null,
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      return new Response(chunks.map((chunk) => `${JSON.stringify(chunk)}\n`).join(""), {
        headers: {
          "content-type": "application/x-ndjson",
          "X-OpenExcel-Run-Id": "7",
        },
      });
    };

    try {
      const onCreateSession = vi.fn().mockResolvedValue({ id: 19 });
      const onSessionActivated = vi.fn();
      const onUserTurnAccepted = vi.fn();
      const hook = renderHook(
        ({ sessionId }: { sessionId: number | null }) =>
          useChatConversation({
            sessionId,
            workspaceId: 1,
            onCreateSession,
            onSessionActivated,
            onUserTurnAccepted,
          }),
        { initialProps: { sessionId: null as number | null } },
      );
      onSessionActivated.mockImplementation(() => {
        hook.rerender({ sessionId: 19 });
      });

      act(() => {
        hook.result.current.sendMessage("你是谁", []);
      });

      await waitFor(() => expect(hook.result.current.isStreaming).toBe(false));
      expect(hook.result.current.messages).toEqual([
        {
          id: "00000000-0000-4000-8000-000000000001",
          role: "user",
          parts: [{ type: "text", text: "你是谁" }],
        },
        expect.objectContaining({
          id: "assistant-1",
          role: "assistant",
          parts: [expect.objectContaining({ type: "text", text: "你好" })],
        }),
      ]);
      expect(onCreateSession).toHaveBeenCalledOnce();
      expect(onSessionActivated).toHaveBeenCalledWith(19);
      await waitFor(() => expect(onUserTurnAccepted).toHaveBeenCalledWith(19));
    } finally {
      globalThis.fetch = originalFetch;
      randomUUID.mockRestore();
    }
  });

  it("does not notify the session layer before run.started", async () => {
    const originalFetch = globalThis.fetch;
    const onUserTurnAccepted = vi.fn();
    const event = {
      eventId: "event-completed",
      sequence: 1,
      type: "run.completed",
      occurredAt: "2026-07-26T00:00:00.002Z",
      payload: {},
    };

    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("/messages?")) {
        return new Response(JSON.stringify({ messages: [], total: 0 }), {
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/context-usage")) {
        return new Response(
          JSON.stringify({
            contextWindowTokens: 180_000,
            usedTokens: 0,
            estimatedContextTokens: null,
            percentage: 0,
            source: "none",
            runId: null,
            updatedAt: null,
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      return new Response(`${JSON.stringify(event)}\n`, {
        headers: { "content-type": "application/x-ndjson", "X-OpenExcel-Run-Id": "7" },
      });
    });

    try {
      const hook = renderHook(() =>
        useChatConversation({ sessionId: 19, workspaceId: 1, onUserTurnAccepted }),
      );

      act(() => {
        hook.result.current.sendMessage("不应触发标题", []);
      });
      await waitFor(() => expect(hook.result.current.isStreaming).toBe(false));

      expect(onUserTurnAccepted).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("cancels a run when stop is clicked before the run id response arrives", async () => {
    const originalFetch = globalThis.fetch;
    let resolveChatResponse!: (response: Response) => void;
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const responseReady = new Promise<Response>((resolve) => {
      resolveChatResponse = resolve;
    });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
      },
    });

    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes("/messages?")) {
        return new Response(JSON.stringify({ messages: [], total: 0 }), {
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/context-usage")) {
        return new Response(
          JSON.stringify({
            contextWindowTokens: 180_000,
            usedTokens: 0,
            estimatedContextTokens: null,
            percentage: 0,
            source: "none",
            runId: null,
            updatedAt: null,
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      if (url.endsWith("/runs/7/cancel")) {
        return new Response(
          JSON.stringify({ runId: 7, status: "cancelled", cancelRequested: true }),
          {
            headers: { "content-type": "application/json" },
          },
        );
      }
      return responseReady;
    });

    try {
      const hook = renderHook(() =>
        useChatConversation({
          sessionId: 19,
          workspaceId: 1,
        }),
      );

      act(() => {
        hook.result.current.sendMessage("停止我", []);
      });
      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

      act(() => {
        hook.result.current.stop();
      });

      resolveChatResponse(
        new Response(stream, {
          headers: {
            "content-type": "application/x-ndjson",
            "X-OpenExcel-Run-Id": "7",
          },
        }),
      );
      await waitFor(() =>
        expect(globalThis.fetch).toHaveBeenCalledWith(
          "/api/workspaces/1/sessions/19/runs/7/cancel",
          expect.objectContaining({ method: "POST" }),
        ),
      );

      streamController.enqueue(
        new TextEncoder().encode(
          `${JSON.stringify({
            eventId: "event-cancelled",
            sequence: 1,
            type: "run.cancelled",
            occurredAt: "2026-07-26T00:00:00.001Z",
            payload: {},
          })}\n`,
        ),
      );
      streamController.close();

      await waitFor(() => expect(hook.result.current.isStreaming).toBe(false));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps streamed text and exposes a failed run error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      if (String(input).includes("/messages?")) {
        return new Response(JSON.stringify({ messages: [], total: 0 }), {
          headers: { "content-type": "application/json" },
        });
      }
      if (String(input).endsWith("/context-usage")) {
        return new Response(
          JSON.stringify({
            contextWindowTokens: 180_000,
            usedTokens: 0,
            estimatedContextTokens: null,
            percentage: 0,
            source: "none",
            runId: null,
            updatedAt: null,
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        `${[
          {
            eventId: "event-text",
            sequence: 1,
            type: "message.delta",
            occurredAt: "2026-07-26T00:00:00.000Z",
            payload: { messageId: "assistant-1", partId: "text-1", delta: "已完成工具调用。" },
          },
          {
            eventId: "event-failed",
            sequence: 2,
            type: "run.failed",
            occurredAt: "2026-07-26T00:00:00.001Z",
            payload: { error: "模型继续生成失败" },
          },
        ]
          .map((event) => JSON.stringify(event))
          .join("\n")}\n`,
        {
          headers: {
            "content-type": "application/x-ndjson",
            "X-OpenExcel-Run-Id": "8",
          },
        },
      );
    };

    try {
      const hook = renderHook(() => useChatConversation({ sessionId: 19, workspaceId: 1 }));

      act(() => {
        hook.result.current.sendMessage("继续", []);
      });

      await waitFor(() => expect(hook.result.current.isStreaming).toBe(false));
      expect(hook.result.current.messages.at(-1)).toMatchObject({
        role: "assistant",
        parts: [{ type: "text", text: "已完成工具调用。" }],
      });
      expect(hook.result.current.error?.message).toBe("模型继续生成失败");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
