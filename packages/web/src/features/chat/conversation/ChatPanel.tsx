import type { SheetChangeDelta } from "@openexcel/core";
import { ChatComposer } from "../composer/ChatComposer";
import { MessageList } from "../message/MessageList";
import { useChatConversation } from "../hooks/useChatConversation";
import type { WorkbookStructureUpdate } from "../hooks/useSheetPatchSync";

export function ChatPanel({
  sessionId,
  workspaceId,
  initialMessages,
  onRunComplete,
  onSheetChanged,
  onWorkbookStructureChanged,
  onStreamingChange,
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
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, background: "var(--background)", position: "relative" }}>
      <MessageList
        messages={messages}
        isStreaming={isStreaming}
        onRegenerate={onRegenerate}
      />

      {error && (
        <div style={{ padding: "0 14px 10px" }}>
          <div style={{
            border: "1px solid var(--border)",
            background: "var(--muted)",
            color: "var(--muted-foreground)",
            borderRadius: "var(--radius-sm)",
            padding: "8px 12px",
            fontSize: 13,
            lineHeight: 1.5,
          }}>
            对话失败：{error.message}
          </div>
        </div>
      )}

      <ChatComposer
        isStreaming={isStreaming}
        onSend={sendMessage}
        onStop={stop}
        referenceCacheRevision={referenceCacheRevision}
        workspaceId={workspaceId}
      />
    </div>
  );
}