import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert/Alert";
import { ChatComposer, type ChatComposerHandle } from "@/features/chat/composer/ChatComposer";
import { useChatConversation } from "@/features/chat/hooks/useChatConversation";
import { MessageList } from "@/features/chat/message/MessageList";
import msgStyles from "@/features/chat/message/MessageList.module.css";
import { useSessionInfra } from "@/features/session/SessionShellContext";
import { t } from "@/lib/i18n";
import styles from "./ChatPanel.module.css";

export function ChatPanel({
  sessionId,
  pendingDraftTextRef,
  onRunComplete,
  onRegenerate,
}: {
  sessionId: number;
  pendingDraftTextRef: React.MutableRefObject<{ [sessionId: number]: string }>;
  onRunComplete?: (sessionId: number, messages: any[]) => Promise<void> | void;
  onRegenerate?: () => void;
}) {
  const {
    workspaceId,
    initialMessages,
    onWorkspaceRefresh,
    onUndoComplete,
    onAttachExcel,
    referenceCacheRevision,
    onNavigateSheet,
  } = useSessionInfra();

  const {
    messages,
    error,
    isStreaming,
    loadingOlder,
    hasOlder,
    sendMessage,
    stop,
    loadOlderMessages,
    onUndo,
  } = useChatConversation({
    sessionId,
    workspaceId,
    initialMessages,
    onRunComplete: (finishedMessages) => {
      return onRunComplete?.(sessionId, finishedMessages);
    },
    onWorkspaceRefresh,
  });

  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [canUndo, setCanUndo] = useState(true);
  const composerRef = useRef<ChatComposerHandle>(null);
  const prevStreaming = useRef(isStreaming);

  useEffect(() => {
    if (prevStreaming.current && !isStreaming) {
      setCanUndo(true);
    }
    prevStreaming.current = isStreaming;
  }, [isStreaming]);

  useEffect(() => {
    setCanUndo(true);
  }, [sessionId]);

  const handleUndo = useCallback(async () => {
    if (!onUndo || isUndoing) return;
    setIsUndoing(true);
    try {
      const result = await onUndo();
      composerRef.current?.restoreDraft(result.undoneUserText);
      await onUndoComplete?.();
      setCanUndo(false);
    } catch (error) {
      console.error("[chat] Failed to undo latest run:", error);
    } finally {
      setIsUndoing(false);
    }
  }, [onUndo, isUndoing, onUndoComplete]);

  useEffect(() => {
    const text = pendingDraftTextRef.current[sessionId];
    if (text) {
      delete pendingDraftTextRef.current[sessionId];
      sendMessage(text);
    }
  }, [pendingDraftTextRef, sendMessage, sessionId]);

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
        onRegenerate={onRegenerate}
        onUndo={canUndo ? handleUndo : undefined}
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
            {t("chat_failed", "对话失败")}：{error.message}
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
            {t("scroll_to_bottom", "回到底部")}
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
      />
    </div>
  );
}
