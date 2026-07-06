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
  initialMessages,
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
  initialMessages: any[];
  onRunComplete?: (sessionId: number, messages: any[]) => void;
  onSheetChanged?: (sheetId: number, delta: SheetChangeDelta | null) => void;
  onWorkbookStructureChanged?: (update: WorkbookStructureUpdate) => void;
  onStreamingChange?: (isStreaming: boolean) => void;
  onAttachExcel: (file: File) => Promise<void> | void;
  referenceCacheRevision: number;
  onRegenerate?: () => void;
}) {
  const { messages, error, isStreaming, sendMessage, stop } = useChatConversation({
    sessionId,
    workspaceId,
    initialMessages,
    onRunComplete: (finishedMessages) => {
      onRunComplete?.(sessionId, finishedMessages);
    },
    onSheetChanged,
    onWorkbookStructureChanged,
    onStreamingChange,
  });

  return (
    <div className={styles.container}>
      <MessageList
        messages={messages}
        isStreaming={isStreaming}
        onRegenerate={onRegenerate}
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