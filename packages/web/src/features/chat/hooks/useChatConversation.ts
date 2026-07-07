import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { fetchMessages as fetchChatMessages, undoLatestRun } from "@/api/chat";
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

export function useChatConversation({
  sessionId,
  workspaceId,
  initialMessages,
  messageTotal,
  onRunComplete,
  onWorkspaceRefresh,
  onStreamingChange,
}: {
  sessionId: number;
  workspaceId: number;
  initialMessages: any[];
  messageTotal: number;
  onRunComplete?: (messages: any[]) => Promise<void> | void;
  onWorkspaceRefresh?: () => Promise<void> | void;
  onStreamingChange?: (isStreaming: boolean) => void;
}) {
  const messagesRef = useRef<any[]>(initialMessages);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const seenWorkbookMutationToolCallIdsRef = useRef<Set<string>>(new Set());
  const hasPrimedWorkbookMutationHistoryRef = useRef(false);
  const pendingWorkspaceRefreshRef = useRef(false);
  const wasStreamingRef = useRef(false);

  const transport = useMemo(() => new DefaultChatTransport({
    api: `/api/workspaces/${workspaceId}/sessions/${sessionId}/chat`,
  }), [sessionId, workspaceId]);

  const { messages, setMessages, sendMessage, status, stop, error } = useChat({
    id: String(sessionId),
    messages: initialMessages,
    transport,
    onFinish: ({ isAbort, isError, messages: finishedMessages }) => {
      if (isAbort || isError) return;
      void onRunComplete?.(finishedMessages);
    },
  });

  messagesRef.current = messages;

  useEffect(() => {
    setHasOlder(initialMessages.length < messageTotal);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isStreaming = status === "submitted" || status === "streaming";

  useEffect(() => {
    onStreamingChange?.(isStreaming);
  }, [isStreaming, onStreamingChange]);

  useEffect(() => {
    const toolCallIds = collectWorkbookMutationToolCallIds(messages, seenWorkbookMutationToolCallIdsRef.current);
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

  const handleSend = useCallback((text: string) => {
    if (!text || isStreaming) return;
    sendMessage({ text });
  }, [isStreaming, sendMessage]);

  const loadOlderMessages = useCallback(async () => {
    if (loadingOlder || !hasOlder) return;
    setLoadingOlder(true);
    try {
      const offset = messagesRef.current.length;
      const { messages: olderMsgs, total } = await fetchChatMessages(workspaceId, sessionId, PAGE_SIZE, offset);
      if (olderMsgs.length === 0) {
        setHasOlder(false);
        return;
      }
      setMessages([...olderMsgs, ...messagesRef.current]);
      setHasOlder(messagesRef.current.length + olderMsgs.length < total);
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
    loadingOlder,
    hasOlder,
    sendMessage: handleSend,
    stop,
    loadOlderMessages,
    onUndo: handleUndo,
  };
}
