import { useCallback, useEffect, useRef, useState } from "react";
import { undoLatestRun } from "@/api/chat";
import type { ChatReferenceTarget } from "../composer/chatReferences";
import { ConversationStore } from "../conversation/conversationStore";
import type { ChatEvent } from "../transport/chatEventStream";
import { useChatHistory } from "./useChatHistory";
import { useChatRun } from "./useChatRun";
import { parseCommittedMutationToolEvent } from "./useSheetPatchSync";

function userMessageIdForText(messages: any[], text: string) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user" || !Array.isArray(message.parts)) continue;
    const value = message.parts
      .filter((part: any) => part?.type === "text")
      .map((part: any) => part.text)
      .join("");
    if (value.trim() === text.trim() && typeof message.id === "string") return message.id;
  }
  throw new Error("会话消息与撤销结果不一致，无法更新本地状态");
}

export function useChatConversation({
  sessionId,
  workspaceId,
  onCreateSession,
  onSessionActivated,
  onUserTurnAccepted,
  initialCanUndo,
  onToolFinished,
  onStreamingChange,
}: {
  sessionId: number | null;
  workspaceId: number;
  onCreateSession?: () => Promise<{ id: number }>;
  onSessionActivated?: (sessionId: number) => Promise<void> | void;
  onUserTurnAccepted?: (sessionId: number) => void;
  initialCanUndo?: boolean;
  onToolFinished?: (event: ChatEvent) => void | Promise<void>;
  onStreamingChange?: (isStreaming: boolean) => void;
}) {
  const storeRef = useRef<ConversationStore>(new ConversationStore());
  const store = storeRef.current;
  const liveSessionIdRef = useRef<number | null>(null);
  const [messages, setMessages] = useState(store.messages);
  const [contextUsage, setContextUsage] = useState(store.contextUsage);

  useEffect(
    () =>
      store.subscribe(() => {
        setMessages(store.messages);
        setContextUsage(store.contextUsage);
      }),
    [store],
  );

  const {
    canUndo,
    historicalToolCallIds,
    initialLoaded,
    invalidateUndo,
    loadOlderMessages,
    loadingOlder,
    markCanUndo,
    hasOlder,
  } = useChatHistory({
    sessionId,
    workspaceId,
    store,
    initialCanUndo,
    skipSessionIdRef: liveSessionIdRef,
  });

  const handleSessionActivated = useCallback(
    async (nextSessionId: number) => {
      liveSessionIdRef.current = nextSessionId;
      await onSessionActivated?.(nextSessionId);
    },
    [onSessionActivated],
  );

  const handleToolFinished = useCallback(
    (event: ChatEvent) => {
      if (sessionId != null && parseCommittedMutationToolEvent(event)) {
        markCanUndo();
      }
      return onToolFinished?.(event);
    },
    [markCanUndo, onToolFinished, sessionId],
  );

  const run = useChatRun({
    sessionId,
    workspaceId,
    store,
    onCreateSession,
    onSessionActivated: handleSessionActivated,
    onUserTurnAccepted,
    onInvalidateUndo: invalidateUndo,
    onToolFinished: handleToolFinished,
  });

  useEffect(() => {
    onStreamingChange?.(run.isStreaming);
  }, [onStreamingChange, run.isStreaming]);

  const handleUndo = useCallback(async (): Promise<{ undoneUserText: string }> => {
    if (run.isStreaming) throw new Error("对话进行中，无法撤销");
    if (sessionId == null) throw new Error("当前会话尚未持久化");

    const result = await undoLatestRun(workspaceId, sessionId);
    const messageId = userMessageIdForText(store.messages, result.undoneUserText);
    store.removeAfterUserMessage(messageId);
    invalidateUndo();
    return { undoneUserText: result.undoneUserText };
  }, [invalidateUndo, run.isStreaming, sessionId, store, workspaceId]);

  const sendMessage = useCallback(
    (text: string, references: ChatReferenceTarget[]) => {
      run.sendMessage(text, references);
    },
    [run.sendMessage],
  );

  return {
    assistantActivity: run.assistantActivity,
    messages,
    contextUsage,
    historicalToolCallIds,
    error: run.error,
    canUndo,
    isStreaming: run.isStreaming,
    initialLoaded,
    loadingOlder,
    hasOlder,
    sendMessage,
    stop: run.stop,
    loadOlderMessages,
    onUndo: sessionId == null ? undefined : handleUndo,
  };
}
