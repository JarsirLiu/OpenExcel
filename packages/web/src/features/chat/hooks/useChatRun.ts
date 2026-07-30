import { useCallback, useEffect, useRef, useState } from "react";
import { cancelRun } from "@/api/chat";
import type { ChatReferenceTarget } from "../composer/chatReferences";
import type { AssistantActivity } from "../conversation/assistantActivity";
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

const PULSE_REVEAL_DELAY_MS = 400;
const PULSE_MIN_VISIBLE_MS = 600;

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
  onUserTurnAccepted,
  onInvalidateUndo,
}: {
  sessionId: number | null;
  workspaceId: number;
  store: ConversationStore;
  onCreateSession?: () => Promise<{ id: number }>;
  onSessionActivated?: (sessionId: number) => Promise<void> | void;
  onUserTurnAccepted?: (sessionId: number) => void;
  onInvalidateUndo?: () => void;
}) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | undefined>();
  const [assistantActivity, setAssistantActivity] = useState<AssistantActivity | null>(null);
  const activeSessionIdRef = useRef<number | null>(sessionId);
  const activeRunRef = useRef<number | null>(null);
  const activeRequestControllerRef = useRef<AbortController | null>(null);
  const assistantActivityRef = useRef<AssistantActivity | null>(null);
  const pulseRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseVisibleAtRef = useRef<number | null>(null);
  const cancelRequestedRef = useRef(false);
  const cancellationRequestRef = useRef<{ sessionId: number; runId: number } | null>(null);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);

  const clearPulseTimers = useCallback(() => {
    if (pulseRevealTimerRef.current !== null) {
      clearTimeout(pulseRevealTimerRef.current);
      pulseRevealTimerRef.current = null;
    }
    if (pulseHideTimerRef.current !== null) {
      clearTimeout(pulseHideTimerRef.current);
      pulseHideTimerRef.current = null;
    }
  }, []);

  const updateAssistantActivity = useCallback((activity: AssistantActivity | null) => {
    assistantActivityRef.current = activity;
    setAssistantActivity(activity);
  }, []);

  const clearAssistantActivity = useCallback(() => {
    clearPulseTimers();
    pulseVisibleAtRef.current = null;
    updateAssistantActivity(null);
  }, [clearPulseTimers, updateAssistantActivity]);

  const startPulseReveal = useCallback(
    (activity: AssistantActivity) => {
      clearPulseTimers();
      pulseVisibleAtRef.current = null;
      updateAssistantActivity({ ...activity, showPulse: false });
      pulseRevealTimerRef.current = setTimeout(() => {
        pulseRevealTimerRef.current = null;
        pulseVisibleAtRef.current = Date.now();
        updateAssistantActivity({ ...activity, showPulse: true });
      }, PULSE_REVEAL_DELAY_MS);
    },
    [clearPulseTimers, updateAssistantActivity],
  );

  const markAssistantResponding = useCallback(
    (phase: AssistantActivity["phase"]) => {
      const current = assistantActivityRef.current;
      if (!current) return;
      if (pulseRevealTimerRef.current !== null) {
        clearTimeout(pulseRevealTimerRef.current);
        pulseRevealTimerRef.current = null;
      }
      const visibleAt = pulseVisibleAtRef.current;
      const remaining =
        current.showPulse && visibleAt !== null
          ? Math.max(0, PULSE_MIN_VISIBLE_MS - (Date.now() - visibleAt))
          : 0;
      const finish = () => {
        pulseHideTimerRef.current = null;
        pulseVisibleAtRef.current = null;
        updateAssistantActivity({ ...current, phase, showPulse: false });
      };
      if (remaining === 0) finish();
      else {
        if (pulseHideTimerRef.current !== null) clearTimeout(pulseHideTimerRef.current);
        pulseHideTimerRef.current = setTimeout(finish, remaining);
      }
    },
    [updateAssistantActivity],
  );

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
      clearAssistantActivity();
      generationRef.current += 1;
      setIsStreaming(false);
      setError(undefined);
    }
    activeSessionIdRef.current = sessionId;
  }, [clearAssistantActivity, sessionId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRequestControllerRef.current?.abort();
      clearAssistantActivity();
    };
  }, [clearAssistantActivity]);

  const sendMessage = useCallback(
    (text: string, references: ChatReferenceTarget[]) => {
      if (!text || isStreaming) return;
      onInvalidateUndo?.();
      setError(undefined);
      cancelRequestedRef.current = false;
      cancellationRequestRef.current = null;
      clearAssistantActivity();
      let generation = generationRef.current;
      let streamSessionId = activeSessionIdRef.current;
      const message = createUserMessage(text, references);
      const assistantMessageId = `${message.id}-assistant`;
      store.appendOptimisticUserMessage(message);
      startPulseReveal({
        assistantMessageId,
        phase: "initial",
        showPulse: false,
      });
      const controller = new AbortController();
      let requestStarted = false;
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

          const responseSessionId = streamSessionId;
          const target = `/api/workspaces/${workspaceId}/sessions/${responseSessionId}/chat`;
          requestStarted = true;
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
            if (cancelRequestedRef.current) {
              clearAssistantActivity();
            } else if (event.type === "step.started") {
              const current = assistantActivityRef.current;
              if (current?.phase === "initial") {
                updateAssistantActivity({ ...current, phase: "model-waiting" });
              } else {
                startPulseReveal({
                  assistantMessageId: current?.assistantMessageId ?? assistantMessageId,
                  phase: "model-waiting",
                  showPulse: false,
                });
              }
            } else if (event.type === "message.delta" || event.type === "reasoning.delta") {
              markAssistantResponding("responding");
            } else if (event.type === "tool.started") {
              markAssistantResponding("tool-running");
            } else if (event.type === "context.automatic_compaction.started") {
              markAssistantResponding("compacting");
            } else if (event.type === "context.automatic_compaction.completed") {
              const current = assistantActivityRef.current;
              if (current) updateAssistantActivity({ ...current, phase: "model-waiting" });
            } else if (event.type === "step.finished") {
              markAssistantResponding("responding");
            }
            if (event.type === "run.started") {
              onUserTurnAccepted?.(responseSessionId);
            }
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
              clearAssistantActivity();
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
          clearAssistantActivity();
          setIsStreaming(false);
        } catch (sendError) {
          if (!requestStarted && generationRef.current === generation && mountedRef.current) {
            store.removeOptimisticUserMessage(message.id);
          }
          if (
            controller.signal.aborted ||
            generationRef.current !== generation ||
            !mountedRef.current
          ) {
            return;
          }
          activeRunRef.current = null;
          clearAssistantActivity();
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
      onUserTurnAccepted,
      requestRunCancellation,
      clearAssistantActivity,
      markAssistantResponding,
      store,
      startPulseReveal,
      updateAssistantActivity,
      workspaceId,
    ],
  );

  const stop = useCallback(() => {
    cancelRequestedRef.current = true;
    const runId = activeRunRef.current;
    const targetSessionId = activeSessionIdRef.current;
    if (runId != null && targetSessionId != null) {
      requestRunCancellation(runId, targetSessionId);
      activeRequestControllerRef.current?.abort();
      activeRequestControllerRef.current = null;
      activeRunRef.current = null;
      setIsStreaming(false);
      clearAssistantActivity();
      return;
    }
    // The run id is delivered in the response headers. Keep the request alive
    // until that callback can submit the cancellation for a just-created run.
    setIsStreaming(false);
    clearAssistantActivity();
  }, [clearAssistantActivity, requestRunCancellation]);

  return { assistantActivity, error, isStreaming, sendMessage, stop };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}
