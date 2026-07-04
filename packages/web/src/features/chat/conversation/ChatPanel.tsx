import type { SheetChangeDelta } from "@openexcel/core";
import { ChatComposer } from "../composer/ChatComposer";
import { MessageList } from "../message/MessageList";
import { useChatConversation } from "../hooks/useChatConversation";
import type { WorkbookStructureUpdate } from "../hooks/useSheetPatchSync";

type SheetMeta = { workbookId: number; workbookName: string; id: number; name: string };

export function ChatPanel({
  sessionId,
  initialMessages,
  onRunComplete,
  onSheetChanged,
  onWorkbookStructureChanged,
  onStreamingChange,
  sheets,
}: {
  sessionId: number;
  initialMessages: any[];
  onRunComplete?: (sessionId: number, messages: any[]) => void;
  onSheetChanged?: (sheetId: number, delta: SheetChangeDelta | null) => void;
  onWorkbookStructureChanged?: (update: WorkbookStructureUpdate) => void;
  onStreamingChange?: (isStreaming: boolean) => void;
  sheets: SheetMeta[];
}) {
  const { messages, error, isStreaming, sendMessage, stop } = useChatConversation({
    sessionId,
    initialMessages,
    onRunComplete: (finishedMessages) => {
      onRunComplete?.(sessionId, finishedMessages);
    },
    onSheetChanged,
    onWorkbookStructureChanged,
    onStreamingChange,
  });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, background: "#fff", position: "relative", overflow: "hidden" }}>
      <MessageList messages={messages} isStreaming={isStreaming} />

      {error && (
        <div style={{ padding: "0 14px 10px" }}>
          <div style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#b91c1c",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 13,
            lineHeight: 1.5,
          }}>
            对话失败：{error.message}
          </div>
        </div>
      )}

      <ChatComposer
        sheets={sheets}
        isStreaming={isStreaming}
        onSend={sendMessage}
        onStop={stop}
      />
    </div>
  );
}
