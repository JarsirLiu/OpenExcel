import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchMessages as fetchChatMessages, undoLatestRun } from "@/api/chat";
import {
  collectSheetPatchUpdates,
  collectWorkbookStructureUpdates,
  type SheetPatchUpdate,
} from "./useSheetPatchSync";

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
  initialMessages,
  onRunComplete,
  onWorkspaceRefresh,
  onSheetMutation,
  onStreamingChange,
}: {
  sessionId: number;
  workspaceId: number;
  initialMessages?: any[];
  onRunComplete?: (messages: any[]) => Promise<void> | void;
  onWorkspaceRefresh?: () => Promise<void> | void;
  onSheetMutation?: (update: SheetPatchUpdate) => Promise<void> | void;
  onStreamingChange?: (isStreaming: boolean) => void;
}) {
  const messagesRef = useRef<any[]>(initialMessages ?? []);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(!!initialMessages);
  const seenWorkbookMutationToolCallIdsRef = useRef<Set<string>>(new Set());
  const hasPrimedWorkbookMutationHistoryRef = useRef(false);
  const pendingWorkspaceRefreshRef = useRef(false);
  const wasStreamingRef = useRef(false);
  const loadedOffsetRef = useRef(initialMessages?.length ?? 0);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `/api/workspaces/${workspaceId}/sessions/${sessionId}/chat`,
      }),
    [sessionId, workspaceId],
  );

  const { messages, setMessages, sendMessage, status, stop, error } = useChat({
    id: String(sessionId),
    messages: initialMessages ?? [],
    transport,
    onFinish: ({ isAbort, isError, messages: finishedMessages }) => {
      if (isAbort || isError) return;
      void onRunComplete?.(finishedMessages);
    },
  });

  messagesRef.current = messages;

  // Load initial messages when switching to a session (not from route loader)
  useEffect(() => {
    if (initialMessages != null) return;

    let cancelled = false;
    setInitialLoaded(false);
    setHasOlder(false);
    loadedOffsetRef.current = 0;

    const loadInitialMessages = async () => {
      try {
        const { messages: msgs, total } = await fetchChatMessages(
          workspaceId,
          sessionId,
          PAGE_SIZE,
          0,
        );
        if (!cancelled) {
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
        if (!cancelled) {
          setInitialLoaded(true);
        }
      }
    };

    void loadInitialMessages();
    return () => {
      cancelled = true;
    };
  }, [sessionId, workspaceId, initialMessages, setMessages]);

  const isStreaming = status === "submitted" || status === "streaming";

  useEffect(() => {
    onStreamingChange?.(isStreaming);
  }, [isStreaming, onStreamingChange]);

  useEffect(() => {
    if (!error) return;
    setMessages(removeEmptyAssistantMessages);
  }, [error, setMessages]);

  useEffect(() => {
    const patchUpdates = collectSheetPatchUpdates(
      messages,
      seenWorkbookMutationToolCallIdsRef.current,
    );
    const seenAfterPatchUpdates = new Set(seenWorkbookMutationToolCallIdsRef.current);
    for (const update of patchUpdates) {
      seenAfterPatchUpdates.add(update.toolCallId);
    }
    const structureUpdates = collectWorkbookStructureUpdates(messages, seenAfterPatchUpdates);
    const toolCallIds = [
      ...patchUpdates.map((update) => update.toolCallId),
      ...structureUpdates.map((update) => update.toolCallId),
    ];
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

    for (const update of patchUpdates) {
      void onSheetMutation?.(update);
      if (!onSheetMutation) pendingWorkspaceRefreshRef.current = true;
    }
    if (structureUpdates.length > 0) {
      pendingWorkspaceRefreshRef.current = true;
    }
  }, [isStreaming, messages, onSheetMutation]);

  const flushPendingWorkspaceRefresh = useCallback(async () => {
    if (!pendingWorkspaceRefreshRef.current) return;
    pendingWorkspaceRefreshRef.current = false;
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
      if (!text || isStreaming) return;
      sendMessage({ text });
    },
    [isStreaming, sendMessage],
  );

  const loadOlderMessages = useCallback(async () => {
    if (loadingOlder || !hasOlder) return;
    setLoadingOlder(true);
    try {
      const offset = loadedOffsetRef.current;
      const { messages: olderMsgs, total } = await fetchChatMessages(
        workspaceId,
        sessionId,
        PAGE_SIZE,
        offset,
      );
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

    const result = await undoLatestRun(workspaceId, sessionId);
    const nextMessages = trimMessagesAfterUserTurn(messagesRef.current, result.undoneUserText);
    setMessages(nextMessages);

    return { undoneUserText: result.undoneUserText };
  }, [workspaceId, sessionId, isStreaming, setMessages]);

  return {
    messages,
    error,
    isStreaming,
    initialLoaded,
    loadingOlder,
    hasOlder,
    sendMessage: handleSend,
    stop,
    loadOlderMessages,
    onUndo: handleUndo,
  };
}
