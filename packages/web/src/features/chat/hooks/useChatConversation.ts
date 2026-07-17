import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchMessages as fetchChatMessages,
  fetchUndoAvailability,
  undoLatestRun,
} from "@/api/chat";
import { useDraftSessionTransition } from "./useDraftSessionTransition";
import { collectWorkbookMutationToolCallIds } from "./useSheetPatchSync";

const PAGE_SIZE = 40;

type ChatMessageLike = {
  role?: unknown;
  content?: unknown;
  parts?: ReadonlyArray<unknown> | null;
};

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

function removeEmptyAssistantMessages(messages: any[]): any[] {
  return messages.filter(
    (message) =>
      !(
        message?.role === "assistant" &&
        Array.isArray(message.parts) &&
        message.parts.length === 0
      ),
  );
}

export function applyInitialMessages(currentMessages: any[], loadedMessages: any[]): any[] {
  return currentMessages.length > 0 ? currentMessages : loadedMessages;
}

export function useChatConversation({
  sessionId,
  workspaceId,
  onDraftSessionCreated,
  initialMessages,
  onRunSettled,
  onWorkspaceRefresh,
  onStreamingChange,
}: {
  sessionId: number | null;
  workspaceId: number;
  onDraftSessionCreated?: (sessionId: number) => Promise<void> | void;
  initialMessages?: any[];
  onRunSettled?: (messages: any[]) => Promise<void> | void;
  onWorkspaceRefresh?: () => Promise<void> | void;
  onStreamingChange?: (isStreaming: boolean) => void;
}) {
  const messagesRef = useRef<any[]>(initialMessages ?? []);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(!!initialMessages);
  const seenWorkbookMutationToolCallIdsRef = useRef<Set<string>>(new Set());
  const hasPrimedWorkbookMutationHistoryRef = useRef(false);
  const pendingWorkspaceRefreshRef = useRef(false);
  const wasStreamingRef = useRef(false);
  const loadedOffsetRef = useRef(initialMessages?.length ?? 0);
  const requestGenerationRef = useRef(0);
  const undoAvailabilityRequestRef = useRef(0);
  const mountedRef = useRef(true);
  const {
    draftRequestId,
    isTransitioning: isDraftSessionTransitioning,
    captureDraftResponse,
    beginTransition: beginDraftSessionTransition,
    isSendLocked,
  } = useDraftSessionTransition({
    isDraft: sessionId == null,
    onDraftSessionCreated,
  });

  const invalidateUndoAvailability = useCallback(() => {
    undoAvailabilityRequestRef.current += 1;
    setCanUndo(false);
  }, []);

  const refreshUndoAvailability = useCallback(async () => {
    const requestId = undoAvailabilityRequestRef.current + 1;
    undoAvailabilityRequestRef.current = requestId;

    if (sessionId == null) {
      if (mountedRef.current && requestId === undoAvailabilityRequestRef.current) {
        setCanUndo(false);
      }
      return;
    }

    try {
      const result = await fetchUndoAvailability(workspaceId, sessionId);
      if (mountedRef.current && requestId === undoAvailabilityRequestRef.current) {
        setCanUndo(result.canUndo);
      }
    } catch (error) {
      if (mountedRef.current && requestId === undoAvailabilityRequestRef.current) {
        setCanUndo(false);
      }
      console.error("[chat] Failed to refresh undo availability:", error);
    }
  }, [sessionId, workspaceId]);

  const transport = useMemo(() => {
    const isDraft = sessionId == null;
    return new DefaultChatTransport({
      api: isDraft
        ? `/api/workspaces/${workspaceId}/sessions/draft/chat`
        : `/api/workspaces/${workspaceId}/sessions/${sessionId}/chat`,
      headers: isDraft && draftRequestId ? { "Idempotency-Key": draftRequestId } : undefined,
      fetch: async (input, init) => {
        const response = await fetch(input, init);
        captureDraftResponse(response);
        return response;
      },
    });
  }, [captureDraftResponse, draftRequestId, sessionId, workspaceId]);

  const { messages, setMessages, sendMessage, status, stop, error } = useChat({
    id: `${workspaceId}:${sessionId}`,
    messages: initialMessages ?? [],
    transport,
    onFinish: async ({ isAbort, messages: finishedMessages }) => {
      if (!isAbort) {
        beginDraftSessionTransition();
      }
      if (!mountedRef.current) return;
      await onRunSettled?.(finishedMessages);
      await refreshUndoAvailability();
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

    const loadInitialMessages = async () => {
      if (sessionId == null) {
        if (mountedRef.current && generation === requestGenerationRef.current) {
          setInitialLoaded(true);
        }
        return;
      }

      if (initialMessages == null) {
        try {
          const { messages: msgs, total } = await fetchChatMessages(
            workspaceId,
            sessionId,
            PAGE_SIZE,
            0,
            { signal: controller.signal },
          );
          if (mountedRef.current && generation === requestGenerationRef.current) {
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
  }, [sessionId, workspaceId, initialMessages, setMessages]);

  useEffect(() => {
    void refreshUndoAvailability();
  }, [refreshUndoAvailability]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  const isStreaming = status === "submitted" || status === "streaming";

  useEffect(() => {
    onStreamingChange?.(isStreaming);
  }, [isStreaming, onStreamingChange]);

  useEffect(() => {
    if (!error) return;
    setMessages(removeEmptyAssistantMessages);
  }, [error, setMessages]);

  useEffect(() => {
    const toolCallIds = collectWorkbookMutationToolCallIds(
      messages,
      seenWorkbookMutationToolCallIdsRef.current,
    );
    if (toolCallIds.length === 0) {
      hasPrimedWorkbookMutationHistoryRef.current = true;
      return;
    }

    for (const toolCallId of toolCallIds) {
      seenWorkbookMutationToolCallIdsRef.current.add(toolCallId);
    }

    if (!hasPrimedWorkbookMutationHistoryRef.current) {
      hasPrimedWorkbookMutationHistoryRef.current = true;
      return;
    }

    if (!isStreaming && !wasStreamingRef.current) {
      return;
    }

    pendingWorkspaceRefreshRef.current = true;
  }, [isStreaming, messages]);

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
    (text: string) => {
      if (!text || isStreaming || isSendLocked()) return;
      invalidateUndoAvailability();
      sendMessage({ text });
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
