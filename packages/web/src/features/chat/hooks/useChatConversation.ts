import { useCallback, useEffect, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { SheetChangeDelta } from "@openexcel/core";
import { generateSessionTitle } from "../../../api/client";
import { useSheetPatchSync } from "./useSheetPatchSync";
import { getFirstUserText } from "../utils";

export function useChatConversation({
  sessionId,
  initialMessages,
  onRunComplete,
  onSheetChanged,
  onStreamingChange,
}: {
  sessionId: number;
  initialMessages: any[];
  onRunComplete?: () => void;
  onSheetChanged?: (sheetId: number, delta: SheetChangeDelta | null) => void;
  onStreamingChange?: (isStreaming: boolean) => void;
}) {
  const transport = useMemo(() => new DefaultChatTransport({
    api: `/api/sessions/${sessionId}/chat`,
  }), [sessionId]);

  const { messages, sendMessage, status, stop, error } = useChat({
    id: String(sessionId),
    messages: initialMessages,
    transport,
    onFinish: ({ isAbort, isError, messages: finishedMessages }) => {
      if (isAbort || isError) return;

      const firstUserText = getFirstUserText(finishedMessages).trim();
      void (async () => {
        try {
          if (firstUserText) {
            await generateSessionTitle(sessionId, firstUserText);
          }
        } catch (error) {
          console.error("[chat] Failed to generate session title:", error);
        } finally {
          void onRunComplete?.();
        }
      })();
    },
  });

  const isStreaming = status === "submitted" || status === "streaming";

  useEffect(() => {
    onStreamingChange?.(isStreaming);
  }, [isStreaming, onStreamingChange]);

  useSheetPatchSync(messages, onSheetChanged);

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
