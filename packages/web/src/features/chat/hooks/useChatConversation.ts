import { useChat } from "@ai-sdk/react";
import type { SheetChangeDelta } from "@openexcel/core";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cancelRun, fetchMessages as fetchChatMessages, undoLatestRun } from "@/api/chat";
import type { ChatReferenceTarget } from "../composer/chatReferences";
import { useDraftSessionTransition } from "./useDraftSessionTransition";
import {
  collectWorkbookMutationToolCallIds,
  collectWorkbookRefreshToolCallIds,
} from "./useSheetPatchSync";

const PAGE_SIZE = 40;

type ChatMessageLike = {
  role?: unknown;
  content?: unknown;
  parts?: ReadonlyArray<unknown> | null;
};

type SheetChangedHandler = (
  sheetId: number,
  delta: SheetChangeDelta | null,
) => void | Promise<void>;

function extractMessageText(message: ChatMessageLike): string {
  if (typeof message.content === "string") {
    return message.content;
  }

  if (!Array.isArray(message.parts)) {
    return "";
  }

  return message.parts
    .filter((part: any) => part?.type === "text" && typeof part.text === "string")
    .map((part: any) => part.text)
    .join("");
}

function trimMessagesAfterUserTurn(messages: any[], userText: string): any[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as ChatMessageLike;
    if (message?.role !== "user") continue;
    if (extractMessageText(message).trim() === userText.trim()) {
      return messages.slice(0, index);
    }
  }

  throw new Error("会话消息与撤销结果不一致，无法更新本地状态");
}

export function applyInitialMessages(currentMessages: any[], loadedMessages: any[]): any[] {
  return currentMessages.length > 0 ? currentMessages : loadedMessages;
}

function readRunId(response: Response): number | null {
  const value = Number(response.headers.get("X-OpenExcel-Run-Id"));
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function prepareChatTurn(messages: any[], trigger: string) {
  if (trigger !== "submit-message") {
    throw new Error("聊天只支持提交新的用户消息");
  }

  const message = [...messages].reverse().find((candidate) => candidate?.role === "user");
  if (!message || typeof message.id !== "string" || !Array.isArray(message.parts)) {
    throw new Error("缺少有效的用户消息");
  }

  const parts = message.parts.filter(
    (part: any) => part?.type === "text" || part?.type === "data-chat-reference",
  );
  if (parts.length !== message.parts.length || parts.length === 0) {
    throw new Error("用户消息包含不支持的内容");
  }

  return {
    requestId: message.id,
    message: {
      messageId: message.id,
      role: "user" as const,
      parts,
    },
  };
}

export function useChatConversation({
  sessionId,
  workspaceId,
  onDraftSessionCreated,
  initialMessages,
  initialCanUndo,
  onRunSettled,
  onWorkspaceRefresh,
  onSheetChanged,
  onStreamingChange,
}: {
  sessionId: number | null;
  workspaceId: number;
  onDraftSessionCreated?: (sessionId: number) => Promise<void> | void;
  initialMessages?: any[];
  initialCanUndo?: boolean;
  onRunSettled?: () => Promise<void> | void;
  onWorkspaceRefresh?: () => Promise<void> | void;
  onSheetChanged?: SheetChangedHandler;
  onStreamingChange?: (isStreaming: boolean) => void;
}) {
  const messagesRef = useRef<any[]>(initialMessages ?? []);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [canUndo, setCanUndo] = useState(initialCanUndo === true);
  const [initialLoaded, setInitialLoaded] = useState(!!initialMessages);
  const [historicalToolCallIds] = useState<Set<string>>(
    () =>
      new Set(
        initialMessages ? collectWorkbookMutationToolCallIds(initialMessages, new Set()) : [],
      ),
  );
  const seenWorkbookRefreshToolCallIdsRef = useRef<Set<string>>(new Set());
  const hasPrimedWorkbookMutationHistoryRef = useRef(false);
  const pendingWorkspaceRefreshRef = useRef(false);
  const wasStreamingRef = useRef(false);
  const loadedOffsetRef = useRef(initialMessages?.length ?? 0);
  const initialSessionIdRef = useRef(sessionId);
  const previousSessionIdRef = useRef(sessionId);
  const requestGenerationRef = useRef(0);
  const activeRunRef = useRef<number | null>(null);
  const activeSessionIdRef = useRef<number | null>(sessionId);
  const cancelRequestedRef = useRef(false);
  const cancellationRequestRef = useRef<{ sessionId: number; runId: number } | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    setCanUndo(sessionId != null && initialCanUndo === true);
  }, [initialCanUndo, sessionId]);
  const {
    isTransitioning: isDraftSessionTransitioning,
    consumeCreatedSessionTransition,
    captureDraftResponse,
    beginTransition: beginDraftSessionTransition,
    isSendLocked,
  } = useDraftSessionTransition({
    isDraft: sessionId == null,
    onDraftSessionCreated,
  });
  const captureDraftResponseRef = useRef(captureDraftResponse);
  captureDraftResponseRef.current = captureDraftResponse;
  if (sessionId != null) {
    activeSessionIdRef.current = sessionId;
  }

  const requestRunCancellation = useCallback(
    (runId: number, targetSessionId: number) => {
      const previousRequest = cancellationRequestRef.current;
      if (previousRequest?.runId === runId && previousRequest.sessionId === targetSessionId) {
        return;
      }
      cancellationRequestRef.current = { runId, sessionId: targetSessionId };
      void cancelRun(workspaceId, targetSessionId, runId).catch((error) => {
        if (
          cancellationRequestRef.current?.runId === runId &&
          cancellationRequestRef.current.sessionId === targetSessionId
        ) {
          cancellationRequestRef.current = null;
        }
        console.error("[chat] Failed to cancel run:", error);
      });
    },
    [workspaceId],
  );

  const invalidateUndoAvailability = useCallback(() => {
    setCanUndo(false);
  }, []);

  const transport = useMemo(() => {
    return new DefaultChatTransport<any>({
      api: `/api/workspaces/${workspaceId}/sessions/draft/chat`,
      prepareSendMessagesRequest: ({ messages, trigger }) => ({
        body: (() => {
          const turn = prepareChatTurn(messages, trigger);
          cancelRequestedRef.current = false;
          cancellationRequestRef.current = null;
          activeRunRef.current = null;
          return turn;
        })(),
      }),
      fetch: async (input, init) => {
        const targetSessionId = activeSessionIdRef.current;
        const target =
          targetSessionId == null
            ? input
            : `/api/workspaces/${workspaceId}/sessions/${targetSessionId}/chat`;
        const response = await fetch(target, init);
        const runId = readRunId(response);
        const createdSessionId = captureDraftResponseRef.current(response);
        const requestSessionId = createdSessionId ?? targetSessionId;
        if (requestSessionId != null) {
          activeSessionIdRef.current = requestSessionId;
        }
        if (runId != null) {
          activeRunRef.current = runId;
          if (cancelRequestedRef.current && requestSessionId != null) {
            requestRunCancellation(runId, requestSessionId);
          }
        }
        return response;
      },
    });
  }, [beginDraftSessionTransition, requestRunCancellation, workspaceId]);

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop: stopChat,
    error,
  } = useChat({
    id: `${workspaceId}:conversation`,
    messages: initialMessages ?? [],
    transport,
    onFinish: async ({ isAbort }) => {
      activeRunRef.current = null;
      if (!mountedRef.current) return;
      // The server stream closes only after run finalization has persisted the
      // checkpoint. Transitioning here keeps the live projection mounted
      // until its durable history is ready, including explicit cancellation.
      if (sessionId == null) beginDraftSessionTransition();
      if (isAbort) return;
      await onRunSettled?.();
    },
  });

  messagesRef.current = messages;

  // Load initial messages when switching to a session (not from route loader)
  useEffect(() => {
    mountedRef.current = true;
    requestGenerationRef.current += 1;
    const generation = requestGenerationRef.current;
    const controller = new AbortController();

    setInitialLoaded(false);
    setHasOlder(false);
    loadedOffsetRef.current = 0;
    const previousSessionId = previousSessionIdRef.current;
    const transitionedFromDraft = previousSessionId == null && sessionId != null;
    const isCreatedDraftSession =
      transitionedFromDraft && consumeCreatedSessionTransition(sessionId);
    const switchedSession = previousSessionId != null && previousSessionId !== sessionId;
    previousSessionIdRef.current = sessionId;
    if (switchedSession) {
      setMessages([]);
    }

    const loadInitialMessages = async () => {
      if (sessionId == null) {
        if (mountedRef.current && generation === requestGenerationRef.current) {
          setInitialLoaded(true);
        }
        return;
      }

      if (isCreatedDraftSession) {
        loadedOffsetRef.current = messagesRef.current.length;
        if (mountedRef.current && generation === requestGenerationRef.current) {
          setInitialLoaded(true);
        }
        return;
      }

      if (initialMessages == null || sessionId !== initialSessionIdRef.current) {
        try {
          const { messages: msgs, total } = await fetchChatMessages(
            workspaceId,
            sessionId,
            PAGE_SIZE,
            0,
            {
              signal: controller.signal,
            },
          );
          if (mountedRef.current && generation === requestGenerationRef.current) {
            const currentToolCallIds = new Set(
              collectWorkbookMutationToolCallIds(messagesRef.current, new Set()),
            );
            for (const toolCallId of collectWorkbookMutationToolCallIds(msgs, new Set())) {
              if (!currentToolCallIds.has(toolCallId)) {
                historicalToolCallIds.add(toolCallId);
              }
            }
            // A newly created session can start streaming before its first history
            // request completes. Do not let the stale empty response erase the
            // optimistic user message already held by useChat.
            setMessages((currentMessages) => applyInitialMessages(currentMessages, msgs));
            loadedOffsetRef.current = msgs.length;
            setHasOlder(msgs.length < total);
            setInitialLoaded(true);
          }
        } catch {
          // Expected: session invalidated by workspace switch
          if (!controller.signal.aborted && mountedRef.current) {
            setInitialLoaded(true);
          }
        }
      } else if (mountedRef.current && generation === requestGenerationRef.current) {
        setInitialLoaded(true);
      }
    };

    void loadInitialMessages();
    return () => {
      mountedRef.current = false;
      requestGenerationRef.current += 1;
      controller.abort();
    };
  }, [initialMessages, consumeCreatedSessionTransition, sessionId, setMessages, workspaceId]);

  useEffect(() => {
    return () => {
      stopChat();
    };
  }, [stopChat]);

  const stop = useCallback(() => {
    cancelRequestedRef.current = true;
    const run = activeRunRef.current;
    const targetSessionId = activeSessionIdRef.current;
    if (run && targetSessionId != null) {
      requestRunCancellation(run, targetSessionId);
    }
    // The cancel endpoint owns stopping the server run. Calling AI SDK stop()
    // here would discard its in-flight assistant message before the server
    // can settle and persist the events already shown to the user.
  }, [requestRunCancellation]);

  const isStreaming = status === "submitted" || status === "streaming";

  useEffect(() => {
    onStreamingChange?.(isStreaming);
  }, [isStreaming, onStreamingChange]);

  useEffect(() => {
    const toolCallIds = onSheetChanged
      ? collectWorkbookRefreshToolCallIds(messages, seenWorkbookRefreshToolCallIdsRef.current, {
          sheetDeltasHandled: true,
        })
      : collectWorkbookMutationToolCallIds(messages, seenWorkbookRefreshToolCallIdsRef.current);
    if (toolCallIds.length === 0) {
      hasPrimedWorkbookMutationHistoryRef.current = true;
      return;
    }

    for (const toolCallId of toolCallIds) {
      seenWorkbookRefreshToolCallIdsRef.current.add(toolCallId);
    }

    if (!hasPrimedWorkbookMutationHistoryRef.current) {
      hasPrimedWorkbookMutationHistoryRef.current = true;
      return;
    }

    if (!isStreaming && !wasStreamingRef.current) {
      return;
    }

    pendingWorkspaceRefreshRef.current = true;
  }, [isStreaming, messages, onSheetChanged]);

  const flushPendingWorkspaceRefresh = useCallback(async () => {
    if (!pendingWorkspaceRefreshRef.current) return;
    pendingWorkspaceRefreshRef.current = false;
    if (!mountedRef.current) return;
    await onWorkspaceRefresh?.();
  }, [onWorkspaceRefresh]);

  useEffect(() => {
    if (isStreaming) {
      wasStreamingRef.current = true;
      return;
    }

    if (!wasStreamingRef.current) {
      return;
    }

    wasStreamingRef.current = false;
    void flushPendingWorkspaceRefresh();
  }, [flushPendingWorkspaceRefresh, isStreaming]);

  const handleSend = useCallback(
    (text: string, references: ChatReferenceTarget[]) => {
      if (!text || isStreaming || isSendLocked()) return;
      invalidateUndoAvailability();
      if (references.length === 0) {
        sendMessage({ text });
        return;
      }

      sendMessage({
        parts: [
          { type: "text", text },
          ...references.map((reference) => ({
            type: "data-chat-reference" as const,
            data: { reference },
          })),
        ],
      });
    },
    [invalidateUndoAvailability, isSendLocked, isStreaming, sendMessage],
  );

  const loadOlderMessages = useCallback(async () => {
    if (sessionId == null || loadingOlder || !hasOlder) return;
    setLoadingOlder(true);
    try {
      const offset = loadedOffsetRef.current;
      const { messages: olderMsgs, total } = await fetchChatMessages(
        workspaceId,
        sessionId,
        PAGE_SIZE,
        offset,
      );
      if (!mountedRef.current || requestGenerationRef.current === 0) return;
      if (olderMsgs.length === 0) {
        setHasOlder(false);
        return;
      }
      for (const toolCallId of collectWorkbookMutationToolCallIds(olderMsgs, new Set())) {
        historicalToolCallIds.add(toolCallId);
      }
      setMessages([...olderMsgs, ...messagesRef.current]);
      loadedOffsetRef.current += olderMsgs.length;
      setHasOlder(loadedOffsetRef.current < total);
    } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder, hasOlder, workspaceId, sessionId, setMessages]);

  const handleUndo = useCallback(async (): Promise<{ undoneUserText: string }> => {
    if (isStreaming) {
      throw new Error("对话进行中，无法撤销");
    }

    if (sessionId == null) {
      throw new Error("草稿会话尚未持久化");
    }

    const result = await undoLatestRun(workspaceId, sessionId);
    if (!mountedRef.current) throw new Error("当前会话已切换");
    const nextMessages = trimMessagesAfterUserTurn(messagesRef.current, result.undoneUserText);
    setMessages(nextMessages);
    invalidateUndoAvailability();

    return { undoneUserText: result.undoneUserText };
  }, [invalidateUndoAvailability, workspaceId, sessionId, isStreaming, setMessages]);

  return {
    messages,
    historicalToolCallIds,
    error,
    canUndo,
    isStreaming,
    isDraftSessionTransitioning,
    initialLoaded,
    loadingOlder,
    hasOlder,
    sendMessage: handleSend,
    stop,
    loadOlderMessages,
    onUndo: sessionId == null ? undefined : handleUndo,
  };
}
