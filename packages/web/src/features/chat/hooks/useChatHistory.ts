import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMessages as fetchChatMessages } from "@/api/chat";
import type { ConversationStore } from "../conversation/conversationStore";
import { collectWorkbookMutationToolCallIds } from "./useSheetPatchSync";

const PAGE_SIZE = 40;

export function useChatHistory({
  sessionId,
  workspaceId,
  store,
  initialCanUndo,
  skipSessionIdRef,
}: {
  sessionId: number | null;
  workspaceId: number;
  store: ConversationStore;
  initialCanUndo?: boolean;
  skipSessionIdRef: { current: number | null };
}) {
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [canUndo, setCanUndo] = useState(initialCanUndo === true);
  const [historicalToolCallIds] = useState<Set<string>>(() => new Set<string>());
  const loadedOffsetRef = useRef(0);
  const previousSessionIdRef = useRef(sessionId);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);

  const invalidateUndo = useCallback(() => setCanUndo(false), []);
  const markCanUndo = useCallback(() => setCanUndo(true), []);

  useEffect(() => {
    setCanUndo(sessionId != null && initialCanUndo === true);
  }, [initialCanUndo, sessionId]);

  useEffect(() => {
    mountedRef.current = true;
    generationRef.current += 1;
    const generation = generationRef.current;
    const controller = new AbortController();
    const previousSessionId = previousSessionIdRef.current;
    const isCreatedLiveSession = skipSessionIdRef.current === sessionId;
    if (!isCreatedLiveSession && skipSessionIdRef.current !== null) {
      skipSessionIdRef.current = null;
    }
    const switchedSession = previousSessionId != null && previousSessionId !== sessionId;
    previousSessionIdRef.current = sessionId;

    setInitialLoaded(false);
    setHasOlder(false);
    loadedOffsetRef.current = 0;

    if (switchedSession && !isCreatedLiveSession) {
      store.replaceHistory([]);
      historicalToolCallIds.clear();
      setCanUndo(false);
    }

    const load = async () => {
      if (sessionId == null || isCreatedLiveSession) {
        if (isCreatedLiveSession) {
          skipSessionIdRef.current = null;
          loadedOffsetRef.current = store.messages.length;
        }
        if (mountedRef.current && generation === generationRef.current) {
          setInitialLoaded(true);
        }
        return;
      }

      try {
        const { messages, total } = await fetchChatMessages(workspaceId, sessionId, PAGE_SIZE, 0, {
          signal: controller.signal,
        });
        if (!mountedRef.current || generation !== generationRef.current) return;
        for (const toolCallId of collectWorkbookMutationToolCallIds(messages, new Set())) {
          historicalToolCallIds.add(toolCallId);
        }
        const historyIds = new Set(
          messages
            .map((message: any) => message?.id)
            .filter((id: unknown): id is string => typeof id === "string"),
        );
        const localProjection = store.messages.filter(
          (message: any) => typeof message?.id === "string" && !historyIds.has(message.id),
        );
        store.replaceHistory([...messages, ...localProjection]);
        loadedOffsetRef.current = messages.length;
        setHasOlder(messages.length < total);
        setInitialLoaded(true);
      } catch (loadError) {
        if (!controller.signal.aborted && mountedRef.current) {
          console.error("[chat] Failed to load session history:", loadError);
          setInitialLoaded(true);
        }
      }
    };

    void load();
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      controller.abort();
    };
  }, [sessionId, skipSessionIdRef, store, workspaceId]);

  const loadOlderMessages = useCallback(async () => {
    if (sessionId == null || loadingOlder || !hasOlder) return;
    setLoadingOlder(true);
    try {
      const offset = loadedOffsetRef.current;
      const { messages, total } = await fetchChatMessages(
        workspaceId,
        sessionId,
        PAGE_SIZE,
        offset,
      );
      if (!mountedRef.current) return;
      for (const toolCallId of collectWorkbookMutationToolCallIds(messages, new Set())) {
        historicalToolCallIds.add(toolCallId);
      }
      store.prependHistory(messages);
      loadedOffsetRef.current += messages.length;
      setHasOlder(loadedOffsetRef.current < total);
    } finally {
      setLoadingOlder(false);
    }
  }, [hasOlder, loadingOlder, sessionId, store, workspaceId]);

  return {
    canUndo,
    historicalToolCallIds,
    initialLoaded,
    invalidateUndo,
    loadOlderMessages,
    loadingOlder,
    markCanUndo,
    hasOlder,
  };
}
