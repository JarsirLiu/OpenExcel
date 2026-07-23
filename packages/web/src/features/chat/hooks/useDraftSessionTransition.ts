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
    return () => window.clearTimeout(retryTimerRef.current);
  }, []);

  const beginTransition = useCallback(() => {
    const sessionId = createdSessionIdRef.current;
    if (!isDraft || sessionId == null || transitionInFlightRef.current || !onDraftSessionCreated)
      return;

    transitionInFlightRef.current = true;
    setIsTransitioning(true);
    activateSession(sessionId);
  }, [activateSession, isDraft, onDraftSessionCreated]);

  const captureDraftResponse = useCallback(
    (response: Response) => {
      if (!isDraft) return;

      const sessionId = readCreatedSessionId(response);
      if (sessionId == null) return;

      createdSessionIdRef.current = sessionId;
      if (response.status === 409) {
        beginTransition();
      }
    },
    [beginTransition, isDraft],
  );

  return {
    isTransitioning,
    captureDraftResponse,
    beginTransition,
    isSendLocked: () => transitionInFlightRef.current,
  };
}
