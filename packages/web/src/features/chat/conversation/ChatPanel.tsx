import { useEffect } from "react";
import type { SheetChangeDelta } from "@openexcel/core";
import { ChatComposer } from "@/features/chat/composer/ChatComposer";
import { MessageList } from "@/features/chat/message/MessageList";
import { useChatConversation } from "@/features/chat/hooks/useChatConversation";
import type { WorkbookStructureUpdate } from "@/features/chat/hooks/useSheetPatchSync";
import { t } from "@/lib/i18n";
import styles from "./ChatPanel.module.css";

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

  useEffect(() => {
    if (draftPendingText) {
      sendMessage(draftPendingText);
      onDraftSent();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={styles.container}>
      <MessageList
        messages={messages}
        isStreaming={isStreaming}
        onRegenerate={onRegenerate}
        loadingOlder={loadingOlder}
        hasOlder={hasOlder}
        onLoadOlder={loadOlderMessages}
      />

      {error && (
        <div className={styles.error}>
          <div className={styles.errorBox}>
            {t("chat_failed", "对话失败")}：{error.message}
          </div>
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