import type { SheetChangeDelta } from "@openexcel/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { undoLatestRun } from "@/api/chat";
import type { ChatReferenceTarget } from "../composer/chatReferences";
import { ConversationStore } from "../conversation/conversationStore";
import { useChatHistory } from "./useChatHistory";
import { useChatRun } from "./useChatRun";
import {
  collectWorkbookMutationToolCallIds,
  collectWorkbookRefreshToolCallIds,
} from "./useSheetPatchSync";

type SheetChangedHandler = (
  sheetId: number,
  delta: SheetChangeDelta | null,
) => void | Promise<void>;

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
  onWorkspaceRefresh,
  onSheetChanged,
  onStreamingChange,
}: {
  sessionId: number | null;
  workspaceId: number;
  onCreateSession?: () => Promise<{ id: number }>;
  onSessionActivated?: (sessionId: number) => Promise<void> | void;
  onUserTurnAccepted?: (sessionId: number) => void;
  initialCanUndo?: boolean;
  onWorkspaceRefresh?: () => Promise<void> | void;
  onSheetChanged?: SheetChangedHandler;
  onStreamingChange?: (isStreaming: boolean) => void;
}) {
  const storeRef = useRef<ConversationStore>(new ConversationStore());
  const store = storeRef.current;
  const liveSessionIdRef = useRef<number | null>(null);
  const [messages, setMessages] = useState(store.messages);
  const [compactionStatus, setCompactionStatus] = useState(store.compactionStatus);
  const [contextUsage, setContextUsage] = useState(store.contextUsage);
  const [historicalRefreshIds] = useState<Set<string>>(() => new Set());
  const hasPrimedWorkbookMutationHistoryRef = useRef(false);
  const pendingWorkspaceRefreshRef = useRef(false);
  const wasStreamingRef = useRef(false);

  useEffect(
    () =>
      store.subscribe(() => {
        setMessages(store.messages);
        setCompactionStatus(store.compactionStatus);
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

  const run = useChatRun({
    sessionId,
    workspaceId,
    store,
    onCreateSession,
    onSessionActivated: handleSessionActivated,
    onUserTurnAccepted,
    onInvalidateUndo: invalidateUndo,
  });

  useEffect(() => {
    onStreamingChange?.(run.isStreaming);
  }, [onStreamingChange, run.isStreaming]);

  useEffect(() => {
    const toolCallIds = onSheetChanged
      ? collectWorkbookRefreshToolCallIds(messages, historicalRefreshIds, {
          sheetDeltasHandled: true,
        })
      : collectWorkbookMutationToolCallIds(messages, historicalRefreshIds);
    if (toolCallIds.length === 0) {
      hasPrimedWorkbookMutationHistoryRef.current = true;
      return;
    }
    for (const toolCallId of toolCallIds) historicalRefreshIds.add(toolCallId);
    if (!hasPrimedWorkbookMutationHistoryRef.current) {
      hasPrimedWorkbookMutationHistoryRef.current = true;
      return;
    }
    if (sessionId != null) markCanUndo();
    if (!run.isStreaming && !wasStreamingRef.current) return;
    pendingWorkspaceRefreshRef.current = true;
  }, [markCanUndo, messages, onSheetChanged, run.isStreaming, sessionId, historicalRefreshIds]);

  const flushPendingWorkspaceRefresh = useCallback(async () => {
    if (!pendingWorkspaceRefreshRef.current) return;
    pendingWorkspaceRefreshRef.current = false;
    await onWorkspaceRefresh?.();
  }, [onWorkspaceRefresh]);

  useEffect(() => {
    if (run.isStreaming) {
      wasStreamingRef.current = true;
      return;
    }
    if (!wasStreamingRef.current) return;
    wasStreamingRef.current = false;
    void flushPendingWorkspaceRefresh();
  }, [flushPendingWorkspaceRefresh, run.isStreaming]);

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
    messages,
    compactionStatus,
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
