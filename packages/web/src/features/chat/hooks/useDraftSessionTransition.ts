import { useCallback, useEffect, useRef, useState } from "react";

function readCreatedSessionId(response: Response): number | null {
  const sessionId = Number(response.headers.get("X-OpenExcel-Session-Id"));
  return Number.isInteger(sessionId) && sessionId > 0 ? sessionId : null;
}

export function useDraftSessionTransition({
  isDraft,
  onDraftSessionCreated,
}: {
  isDraft: boolean;
  onDraftSessionCreated?: (sessionId: number) => Promise<void> | void;
}) {
  const createdSessionIdRef = useRef<number | null>(null);
  const createdSessionPendingRef = useRef(false);
  const transitionInFlightRef = useRef(false);
  const retryTimerRef = useRef<number | undefined>(undefined);
  const retryAttemptsRef = useRef(0);
  const activateSessionRef = useRef<(sessionId: number) => void>(() => undefined);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const activateSession = useCallback(
    (sessionId: number) => {
      void Promise.resolve(onDraftSessionCreated?.(sessionId))
        .then(() => {
          retryAttemptsRef.current = 0;
        })
        .catch((error) => {
          retryAttemptsRef.current += 1;
          const retryDelay = Math.min(3_000 * 2 ** (retryAttemptsRef.current - 1), 12_000);
          console.error("[chat] Failed to activate the newly created session:", error);
          retryTimerRef.current = window.setTimeout(() => {
            if (transitionInFlightRef.current) {
              activateSessionRef.current(sessionId);
            }
          }, retryDelay);
        });
    },
    [onDraftSessionCreated],
  );

  activateSessionRef.current = activateSession;

  useEffect(() => {
    if (!isDraft && transitionInFlightRef.current) {
      transitionInFlightRef.current = false;
      retryAttemptsRef.current = 0;
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = undefined;
      setIsTransitioning(false);
    }

    return () => window.clearTimeout(retryTimerRef.current);
  }, [isDraft]);

  const beginTransition = useCallback(() => {
    const sessionId = createdSessionIdRef.current;
    if (!isDraft || sessionId == null || transitionInFlightRef.current || !onDraftSessionCreated)
      return;

    transitionInFlightRef.current = true;
    setIsTransitioning(true);
    activateSession(sessionId);
  }, [activateSession, isDraft, onDraftSessionCreated]);

  const consumeCreatedSessionTransition = useCallback((sessionId: number) => {
    if (!createdSessionPendingRef.current || createdSessionIdRef.current !== sessionId)
      return false;
    createdSessionPendingRef.current = false;
    return true;
  }, []);

  const captureDraftResponse = useCallback(
    (response: Response): number | null => {
      if (!isDraft) return null;

      const sessionId = readCreatedSessionId(response);
      if (sessionId == null) return null;

      createdSessionIdRef.current = sessionId;
      createdSessionPendingRef.current = true;
      // The server creates the durable session before opening the event
      // stream. Activate it at that boundary so the UI never treats an
      // already-running turn as a draft conversation.
      beginTransition();
      return sessionId;
    },
    [beginTransition, isDraft],
  );

  return {
    isTransitioning,
    consumeCreatedSessionTransition,
    captureDraftResponse,
    beginTransition,
    isSendLocked: () => transitionInFlightRef.current,
  };
}
