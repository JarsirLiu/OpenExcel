import { useCallback, useEffect, useRef, useState } from "react";
import { ChatComposer, type ChatComposerHandle } from "@/features/chat/composer/ChatComposer";
import { MessageList } from "@/features/chat/message/MessageList";
import { useChatConversation } from "@/features/chat/hooks/useChatConversation";
import { t } from "@/lib/i18n";
import styles from "./ChatPanel.module.css";
import msgStyles from "@/features/chat/message/MessageList.module.css";

export function ChatPanel({
  sessionId,
  workspaceId,
  messages: parentMessages,
  messageTotal,
  onSendInDraft,
  claimPendingDraftText,
  onRunComplete,
  onWorkspaceRefresh,
  onStreamingChange,
  onAttachExcel,
  referenceCacheRevision,
  onRegenerate,
  onUndoComplete,
  onNavigateSheet,
}: {
  sessionId: number | null;
  workspaceId: number;
  messages: any[];
  messageTotal: number;
  onSendInDraft: (text: string) => Promise<number>;
  claimPendingDraftText: (sessionId: number) => string | null;
  onRunComplete?: (sessionId: number, messages: any[]) => Promise<void> | void;
  onWorkspaceRefresh?: () => Promise<void> | void;
  onStreamingChange?: (isStreaming: boolean) => void;
  onAttachExcel: (file: File) => Promise<void> | void;
  referenceCacheRevision: number;
  onRegenerate?: () => void;
  onUndoComplete?: () => Promise<void> | void;
  onNavigateSheet?: (sheetId: number) => void;
}) {
  if (sessionId == null) {
    return (
      <div className={styles.container}>
        <MessageList messages={[]} isStreaming={false} />
        <ChatComposer
          isStreaming={false}
          onSend={(text) => { void onSendInDraft(text); }}
          onStop={() => {}}
          onAttachExcel={onAttachExcel}
          referenceCacheRevision={referenceCacheRevision}
          workspaceId={workspaceId}
        />
      </div>
    );
  }

  return <RealChat
    sessionId={sessionId}
    workspaceId={workspaceId}
    parentMessages={parentMessages}
    messageTotal={messageTotal}
    claimPendingDraftText={claimPendingDraftText}
    onRunComplete={onRunComplete}
    onWorkspaceRefresh={onWorkspaceRefresh}
    onStreamingChange={onStreamingChange}
    onAttachExcel={onAttachExcel}
    referenceCacheRevision={referenceCacheRevision}
    onRegenerate={onRegenerate}
    onUndoComplete={onUndoComplete}
    onNavigateSheet={onNavigateSheet}
  />;
}

function RealChat({
  sessionId,
  workspaceId,
  parentMessages,
  messageTotal,
  claimPendingDraftText,
  onRunComplete,
  onWorkspaceRefresh,
  onStreamingChange,
  onAttachExcel,
  referenceCacheRevision,
  onRegenerate,
  onUndoComplete,
  onNavigateSheet,
}: {
  sessionId: number;
  workspaceId: number;
  parentMessages: any[];
  messageTotal: number;
  claimPendingDraftText: (sessionId: number) => string | null;
  onRunComplete?: (sessionId: number, messages: any[]) => Promise<void> | void;
  onWorkspaceRefresh?: () => Promise<void> | void;
  onStreamingChange?: (isStreaming: boolean) => void;
  onAttachExcel: (file: File) => Promise<void> | void;
  referenceCacheRevision: number;
  onRegenerate?: () => void;
  onUndoComplete?: () => Promise<void> | void;
  onNavigateSheet?: (sheetId: number) => void;
}) {
  const { messages, error, isStreaming, loadingOlder, hasOlder, sendMessage, stop, loadOlderMessages, onUndo } = useChatConversation({
    sessionId,
    workspaceId,
    initialMessages: parentMessages,
    messageTotal,
    onRunComplete: (finishedMessages) => {
      return onRunComplete?.(sessionId, finishedMessages);
    },
    onWorkspaceRefresh,
    onStreamingChange,
  });

  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [canUndo, setCanUndo] = useState(true);
  const composerRef = useRef<ChatComposerHandle>(null);
  const prevStreaming = useRef(isStreaming);

  // 新 AI 流完成后恢复撤销能力
  useEffect(() => {
    if (prevStreaming.current && !isStreaming) {
      setCanUndo(true);
    }
    prevStreaming.current = isStreaming;
  }, [isStreaming]);

  // 切换会话后重置
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
    const pendingDraftText = claimPendingDraftText(sessionId);
    if (pendingDraftText) {
      sendMessage(pendingDraftText);
    }
  }, [claimPendingDraftText, sendMessage, sessionId]);

  const handleScroll = useCallback(() => {
    const el = document.querySelector(`.${msgStyles.messageList}`) as HTMLElement | null;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
    setShowScrollToBottom(!nearBottom);
  }, []);

  // Hide when new messages arrive (auto-scroll kicks in)
  useEffect(() => {
    setShowScrollToBottom(false);
  }, [messages, isStreaming]);

  const handleScrollToBottom = useCallback(() => {
    setShowScrollToBottom(false);
    // Force scroll to bottom
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
          <div className={styles.errorBox}>
            {t("chat_failed", "对话失败")}：{error.message}
          </div>
        </div>
      )}

      {showScrollToBottom && (
        <div className={msgStyles.scrollToBottom}>
          <button className={msgStyles.scrollToBottomBtn} onClick={handleScrollToBottom}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 2v8M2 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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
