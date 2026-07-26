import { useCallback, useEffect, useRef, useState } from "react";
import { cancelRun } from "@/api/chat";
import type { ChatReferenceTarget } from "../composer/chatReferences";
import type { ConversationStore } from "../conversation/conversationStore";
import { openChatEventStream } from "../transport/chatEventStream";

type ChatUserMessage = {
  id: string;
  role: "user";
  parts: Array<
    | { type: "text"; text: string }
    | { type: "data-chat-reference"; data: { reference: ChatReferenceTarget } }
  >;
};

function createUserMessage(text: string, references: ChatReferenceTarget[]): ChatUserMessage {
  return {
    id: crypto.randomUUID(),
    role: "user",
    parts: [
      { type: "text", text },
      ...references.map((reference) => ({
        type: "data-chat-reference" as const,
        data: { reference },
      })),
    ],
  };
}

export function useChatRun({
  sessionId,
  workspaceId,
  store,
  onCreateSession,
  onSessionActivated,
  onInvalidateUndo,
}: {
  sessionId: number | null;
  workspaceId: number;
  store: ConversationStore;
  onCreateSession?: () => Promise<{ id: number }>;
  onSessionActivated?: (sessionId: number) => Promise<void> | void;
  onInvalidateUndo?: () => void;
}) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | undefined>();
  const activeSessionIdRef = useRef<number | null>(sessionId);
  const activeRunRef = useRef<number | null>(null);
  const activeRequestControllerRef = useRef<AbortController | null>(null);
  const cancelRequestedRef = useRef(false);
  const cancellationRequestRef = useRef<{ sessionId: number; runId: number } | null>(null);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);

  const requestRunCancellation = useCallback(
    (runId: number, targetSessionId: number) => {
      const previous = cancellationRequestRef.current;
      if (previous?.runId === runId && previous.sessionId === targetSessionId) return;
      cancellationRequestRef.current = { runId, sessionId: targetSessionId };
      void cancelRun(workspaceId, targetSessionId, runId).catch((cancelError) => {
        if (
          cancellationRequestRef.current?.runId === runId &&
          cancellationRequestRef.current.sessionId === targetSessionId
        ) {
          cancellationRequestRef.current = null;
        }
        console.error("[chat] Failed to cancel run:", cancelError);
      });
    },
    [workspaceId],
  );

  useEffect(() => {
    const previousSessionId = activeSessionIdRef.current;
    if (previousSessionId !== sessionId && previousSessionId != null) {
      activeRequestControllerRef.current?.abort();
      activeRequestControllerRef.current = null;
      activeRunRef.current = null;
      cancelRequestedRef.current = false;
      cancellationRequestRef.current = null;
      generationRef.current += 1;
      setIsStreaming(false);
      setError(undefined);
    }
    activeSessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRequestControllerRef.current?.abort();
    };
  }, []);

  const sendMessage = useCallback(
    (text: string, references: ChatReferenceTarget[]) => {
      if (!text || isStreaming) return;
      onInvalidateUndo?.();
      setError(undefined);
      cancelRequestedRef.current = false;
      cancellationRequestRef.current = null;
      let generation = generationRef.current;
      let streamSessionId = activeSessionIdRef.current;
      const controller = new AbortController();
      activeRequestControllerRef.current = controller;
      setIsStreaming(true);

      void (async () => {
        try {
          if (streamSessionId == null) {
            if (!onCreateSession) throw new Error("创建会话失败：缺少会话控制器");
            const session = await onCreateSession();
            streamSessionId = session.id;
            activeSessionIdRef.current = session.id;
            await onSessionActivated?.(session.id);
            generation = generationRef.current;
          }

          const message = createUserMessage(text, references);
          store.appendOptimisticUserMessage(message);
          const responseSessionId = streamSessionId;
          const target = `/api/workspaces/${workspaceId}/sessions/${responseSessionId}/chat`;
          for await (const event of openChatEventStream({
            api: target,
            body: { requestId: message.id, message },
            signal: controller.signal,
            onRunId: (runId) => {
              activeRunRef.current = runId;
              if (cancelRequestedRef.current) requestRunCancellation(runId, responseSessionId);
            },
          })) {
            if (
              generationRef.current !== generation ||
              activeSessionIdRef.current !== streamSessionId
            ) {
              continue;
            }
            store.applyEvent(event);
            if (
              event.type === "run.completed" ||
              event.type === "run.cancelled" ||
              event.type === "run.failed"
            ) {
              if (event.type === "run.failed") {
                const payload = asRecord(event.payload);
                if (typeof payload?.error === "string" && payload.error.trim().length > 0) {
                  setError(new Error(payload.error));
                }
              }
              activeRunRef.current = null;
              setIsStreaming(false);
            }
          }
          if (
            generationRef.current !== generation ||
            activeSessionIdRef.current !== streamSessionId
          ) {
            return;
          }
          activeRunRef.current = null;
          setIsStreaming(false);
        } catch (sendError) {
          if (
            controller.signal.aborted ||
            generationRef.current !== generation ||
            !mountedRef.current
          ) {
            return;
          }
          activeRunRef.current = null;
          setIsStreaming(false);
          setError(sendError instanceof Error ? sendError : new Error(String(sendError)));
        } finally {
          if (activeRequestControllerRef.current === controller) {
            activeRequestControllerRef.current = null;
          }
        }
      })();
    },
    [
      isStreaming,
      onCreateSession,
      onInvalidateUndo,
      onSessionActivated,
      requestRunCancellation,
      store,
      workspaceId,
    ],
  );

  const stop = useCallback(() => {
    cancelRequestedRef.current = true;
    const runId = activeRunRef.current;
    const targetSessionId = activeSessionIdRef.current;
    if (runId != null && targetSessionId != null) {
      requestRunCancellation(runId, targetSessionId);
    }
  }, [requestRunCancellation]);

  return { error, isStreaming, sendMessage, stop };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}
