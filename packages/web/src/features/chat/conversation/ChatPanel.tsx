import { useCallback, useEffect, useState } from "react";
import type { SheetChangeDelta } from "@openexcel/core";
import { ChatComposer } from "@/features/chat/composer/ChatComposer";
import { MessageList } from "@/features/chat/message/MessageList";
import { useChatConversation } from "@/features/chat/hooks/useChatConversation";
import type { WorkbookStructureUpdate } from "@/features/chat/hooks/useSheetPatchSync";
import { t } from "@/lib/i18n";
import styles from "./ChatPanel.module.css";
import msgStyles from "@/features/chat/message/MessageList.module.css";

export function ChatPanel({
  sessionId,
  workspaceId,
  messages: parentMessages,
  messageTotal,
  onSendInDraft,
  draftPendingText,
  onDraftSent,
  onRunComplete,
  onSheetChanged,
  onWorkbookStructureChanged,
  onStreamingChange,
  onAttachExcel,
  referenceCacheRevision,
  onRegenerate,
}: {
  sessionId: number | null;
  workspaceId: number;
  messages: any[];
  messageTotal: number;
  onSendInDraft: (text: string) => Promise<number>;
  draftPendingText: string | null;
  onDraftSent: () => void;
  onRunComplete?: (sessionId: number, messages: any[]) => void;
  onSheetChanged?: (sheetId: number, delta: SheetChangeDelta | null) => void;
  onWorkbookStructureChanged?: (update: WorkbookStructureUpdate) => void;
  onStreamingChange?: (isStreaming: boolean) => void;
  onAttachExcel: (file: File) => Promise<void> | void;
  referenceCacheRevision: number;
  onRegenerate?: () => void;
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
    draftPendingText={draftPendingText}
    onDraftSent={onDraftSent}
    onRunComplete={onRunComplete}
    onSheetChanged={onSheetChanged}
    onWorkbookStructureChanged={onWorkbookStructureChanged}
    onStreamingChange={onStreamingChange}
    onAttachExcel={onAttachExcel}
    referenceCacheRevision={referenceCacheRevision}
    onRegenerate={onRegenerate}
  />;
}

function RealChat({
  sessionId,
  workspaceId,
  parentMessages,
  messageTotal,
  draftPendingText,
  onDraftSent,
  onRunComplete,
  onSheetChanged,
  onWorkbookStructureChanged,
  onStreamingChange,
  onAttachExcel,
  referenceCacheRevision,
  onRegenerate,
}: {
  sessionId: number;
  workspaceId: number;
  parentMessages: any[];
  messageTotal: number;
  draftPendingText: string | null;
  onDraftSent: () => void;
  onRunComplete?: (sessionId: number, messages: any[]) => void;
  onSheetChanged?: (sheetId: number, delta: SheetChangeDelta | null) => void;
  onWorkbookStructureChanged?: (update: WorkbookStructureUpdate) => void;
  onStreamingChange?: (isStreaming: boolean) => void;
  onAttachExcel: (file: File) => Promise<void> | void;
  referenceCacheRevision: number;
  onRegenerate?: () => void;
}) {
  const { messages, error, isStreaming, loadingOlder, hasOlder, sendMessage, stop, loadOlderMessages } = useChatConversation({
    sessionId,
    workspaceId,
    initialMessages: parentMessages,
    messageTotal,
    onRunComplete: (finishedMessages) => {
      onRunComplete?.(sessionId, finishedMessages);
    },
    onSheetChanged,
    onWorkbookStructureChanged,
    onStreamingChange,
  });

  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  useEffect(() => {
    if (draftPendingText) {
      sendMessage(draftPendingText);
      onDraftSent();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        loadingOlder={loadingOlder}
        hasOlder={hasOlder}
        onLoadOlder={loadOlderMessages}
        onScroll={handleScroll}
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