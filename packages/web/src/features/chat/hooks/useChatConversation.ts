import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { SheetChangeDelta } from "@openexcel/core";
import { fetchMessages as fetchChatMessages } from "@/api/chat";
import { useSheetPatchSync } from "./useSheetPatchSync";
import type { WorkbookStructureUpdate } from "./useSheetPatchSync";

const PAGE_SIZE = 40;

export function useChatConversation({
  sessionId,
  workspaceId,
  initialMessages,
  messageTotal,
  onRunComplete,
  onSheetChanged,
  onWorkbookStructureChanged,
  onStreamingChange,
}: {
  sessionId: number;
  workspaceId: number;
  initialMessages: any[];
  messageTotal: number;
  onRunComplete?: (messages: any[]) => void;
  onSheetChanged?: (sheetId: number, delta: SheetChangeDelta | null) => void;
  onWorkbookStructureChanged?: (update: WorkbookStructureUpdate) => void;
  onStreamingChange?: (isStreaming: boolean) => void;
}) {
  const messagesRef = useRef<any[]>(initialMessages);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);

  const transport = useMemo(() => new DefaultChatTransport({
    api: `/api/workspaces/${workspaceId}/sessions/${sessionId}/chat`,
  }), [sessionId, workspaceId]);

  const { messages, setMessages, sendMessage, status, stop, error } = useChat({
    id: String(sessionId),
    messages: initialMessages,
    transport,
    onFinish: ({ isAbort, isError, messages: finishedMessages }) => {
      if (isAbort || isError) return;
      void onRunComplete?.(finishedMessages);
    },
  });

  messagesRef.current = messages;

  useEffect(() => {
    setHasOlder(initialMessages.length < messageTotal);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isStreaming = status === "submitted" || status === "streaming";

  useEffect(() => {
    onStreamingChange?.(isStreaming);
  }, [isStreaming, onStreamingChange]);

  useSheetPatchSync(messages, onSheetChanged, onWorkbookStructureChanged);

  const handleSend = useCallback((text: string) => {
    if (!text || isStreaming) return;
    sendMessage({ text });
  }, [isStreaming, sendMessage]);

  const loadOlderMessages = useCallback(async () => {
    if (loadingOlder || !hasOlder) return;
    setLoadingOlder(true);
    try {
      const offset = messagesRef.current.length;
      const { messages: olderMsgs, total } = await fetchChatMessages(workspaceId, sessionId, PAGE_SIZE, offset);
      if (olderMsgs.length === 0) {
        setHasOlder(false);
        return;
      }
      setMessages([...olderMsgs, ...messagesRef.current]);
      setHasOlder(messagesRef.current.length + olderMsgs.length < total);
    } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder, hasOlder, workspaceId, sessionId, setMessages]);

  return {
    messages,
    error,
    isStreaming,
    loadingOlder,
    hasOlder,
    sendMessage: handleSend,
    stop,
    loadOlderMessages,
  };
}