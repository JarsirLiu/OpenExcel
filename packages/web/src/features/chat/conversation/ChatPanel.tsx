import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert/Alert";
import { ChatComposer, type ChatComposerHandle } from "@/features/chat/composer/ChatComposer";
import { useChatConversation } from "@/features/chat/hooks/useChatConversation";
import {
  parseCommittedMutationToolEvent,
  useSheetPatchSync,
} from "@/features/chat/hooks/useSheetPatchSync";
import { MessageList } from "@/features/chat/message/MessageList";
import msgStyles from "@/features/chat/message/MessageList.module.css";
import { useSessionInfra } from "@/features/session/SessionShellContext";
import { t } from "@/lib/i18n";
import type { ChatEvent } from "../transport/chatEventStream";
import styles from "./ChatPanel.module.css";

export function ChatPanel({
  sessionId,
  initialCanUndo = false,
  onRegenerate,
}: {
  sessionId: number | null;
  initialCanUndo?: boolean;
  onRegenerate?: () => void;
}) {
  const {
    workspaceId,
    onWorkspaceRefresh,
    onChartsRefresh,
    onAiSheetMutation,
    onUndoComplete,
    onUserTurnAccepted,
    onAttachExcel,
    referenceCacheRevision,
    onNavigateSheet,
    createSession,
    activateSession,
  } = useSessionInfra();

  const liveToolCallIdsRef = useRef(new Set<string>());
  const [liveToolCallIds, setLiveToolCallIds] = useState<ReadonlySet<string>>(new Set());
  const handleCommittedTool = useCallback(
    async (event: ChatEvent) => {
      const mutation = parseCommittedMutationToolEvent(event);
      if (!mutation) {
        return;
      }
      const toolCallId =
        mutation.kind === "sheet" ? mutation.update.toolCallId : mutation.toolCallId;
      if (liveToolCallIdsRef.current.has(toolCallId)) return;

      if (mutation.kind === "sheet" && !onAiSheetMutation) {
        return;
      }
      liveToolCallIdsRef.current.add(toolCallId);
      setLiveToolCallIds((current) => {
        if (current.has(toolCallId)) return current;
        return new Set(current).add(toolCallId);
      });
      try {
        if (mutation.kind === "sheet") {
          if (mutation.update.delta && mutation.update.version) {
            await onAiSheetMutation!(
              mutation.update.sheetId,
              mutation.update.delta,
              mutation.update.version,
            );
          }
        } else if (mutation.kind === "workbook") {
          await onWorkspaceRefresh?.();
        } else {
          await onChartsRefresh?.();
        }
      } catch (error) {
        liveToolCallIdsRef.current.delete(toolCallId);
        setLiveToolCallIds((current) => {
          if (!current.has(toolCallId)) return current;
          const next = new Set(current);
          next.delete(toolCallId);
          return next;
        });
        throw error;
      }
    },
    [onAiSheetMutation, onChartsRefresh, onWorkspaceRefresh],
  );

  const {
    messages,
    assistantActivity,
    contextUsage,
    error,
    canUndo,
    isStreaming,
    initialLoaded,
    historicalToolCallIds,
    loadingOlder,
    hasOlder,
    sendMessage,
    stop,
    loadOlderMessages,
    onUndo,
  } = useChatConversation({
    sessionId,
    workspaceId,
    onCreateSession: createSession,
    onSessionActivated: activateSession,
    onUserTurnAccepted,
    initialCanUndo,
    onToolFinished: handleCommittedTool,
  });

  useSheetPatchSync(
    messages,
    onAiSheetMutation
      ? (sheetId, delta, version) => {
          if (delta && version) {
            void onAiSheetMutation(sheetId, delta, version);
          }
        }
      : undefined,
    initialLoaded,
    historicalToolCallIds,
    liveToolCallIds,
  );

  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const composerRef = useRef<ChatComposerHandle>(null);

  const handleUndo = useCallback(async () => {
    if (!onUndo || isUndoing) return;
    setIsUndoing(true);
    try {
      const result = await onUndo();
      composerRef.current?.restoreDraft(result.undoneUserText);
      await onUndoComplete?.();
    } catch (error) {
      console.error("[chat] Failed to undo latest run:", error);
    } finally {
      setIsUndoing(false);
    }
  }, [onUndo, isUndoing, onUndoComplete]);

  const handleScroll = useCallback(() => {
    const el = document.querySelector(`.${msgStyles.messageList}`) as HTMLElement | null;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
    setShowScrollToBottom(!nearBottom);
  }, []);

  useEffect(() => {
    setShowScrollToBottom(false);
  }, [messages, isStreaming]);

  const handleScrollToBottom = useCallback(() => {
    setShowScrollToBottom(false);
    const el = document.querySelector(`.${msgStyles.messageList}`) as HTMLElement | null;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, []);

  return (
    <div className={styles.container}>
      <MessageList
        messages={messages}
        isStreaming={isStreaming}
        assistantActivity={assistantActivity}
        onRegenerate={onRegenerate}
        onUndo={sessionId != null && canUndo ? handleUndo : undefined}
        isUndoing={isUndoing}
        loadingOlder={loadingOlder}
        hasOlder={hasOlder}
        onLoadOlder={loadOlderMessages}
        onScroll={handleScroll}
        onNavigateSheet={onNavigateSheet}
      />

      {error && (
        <div className={styles.error}>
          <Alert variant="error">
            {t("chat_failed")}：{error.message}
          </Alert>
        </div>
      )}

      {showScrollToBottom && (
        <div className={msgStyles.scrollToBottom}>
          <button className={msgStyles.scrollToBottomBtn} onClick={handleScrollToBottom}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M6 2v8M2 6l4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {t("scroll_to_bottom")}
          </button>
        </div>
      )}

      <ChatComposer
        ref={composerRef}
        isStreaming={isStreaming}
        onSend={sendMessage}
        onStop={stop}
        onAttachExcel={onAttachExcel}
        referenceCacheRevision={referenceCacheRevision}
        workspaceId={workspaceId}
        contextUsage={contextUsage}
      />
    </div>
  );
}
