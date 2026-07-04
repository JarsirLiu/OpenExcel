import { useCallback, useEffect, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { SheetChangeDelta } from "@openexcel/core";
import { useSheetPatchSync } from "./useSheetPatchSync";
import type { WorkbookStructureUpdate } from "./useSheetPatchSync";

export function useChatConversation({
  sessionId,
  workspaceId,
  initialMessages,
  onRunComplete,
  onSheetChanged,
  onWorkbookStructureChanged,
  onStreamingChange,
}: {
  sessionId: number;
  workspaceId: number;
  initialMessages: any[];
  onRunComplete?: (messages: any[]) => void;
  onSheetChanged?: (sheetId: number, delta: SheetChangeDelta | null) => void;
  onWorkbookStructureChanged?: (update: WorkbookStructureUpdate) => void;
  onStreamingChange?: (isStreaming: boolean) => void;
}) {
  const transport = useMemo(() => new DefaultChatTransport({
    api: `/api/workspaces/${workspaceId}/sessions/${sessionId}/chat`,
  }), [sessionId, workspaceId]);

  const { messages, sendMessage, status, stop, error } = useChat({
    id: String(sessionId),
    messages: initialMessages,
    transport,
    onFinish: ({ isAbort, isError, messages: finishedMessages }) => {
      if (isAbort || isError) return;
      void onRunComplete?.(finishedMessages);
    },
  });

  const isStreaming = status === "submitted" || status === "streaming";

  useEffect(() => {
    onStreamingChange?.(isStreaming);
  }, [isStreaming, onStreamingChange]);

  useSheetPatchSync(messages, onSheetChanged, onWorkbookStructureChanged);

  const handleSend = useCallback((text: string) => {
    if (!text || isStreaming) return;
    sendMessage({ text });
  }, [isStreaming, sendMessage]);

  return {
    messages,
    error,
    isStreaming,
    sendMessage: handleSend,
    stop,
  };
}
