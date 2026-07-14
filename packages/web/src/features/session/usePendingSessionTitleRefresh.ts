import { useEffect, useRef } from "react";

const POLL_INTERVAL_MS = 2_000;
const RETRY_DELAYS_MS = [3_000, 6_000, 12_000] as const;

export function getTitleRefreshDelay(failedAttempts: number): number {
  if (failedAttempts === 0) return POLL_INTERVAL_MS;
  return RETRY_DELAYS_MS[Math.min(failedAttempts - 1, RETRY_DELAYS_MS.length - 1)];
}

export function usePendingSessionTitleRefresh({
  hasPendingTitle,
  refreshSessions,
}: {
  hasPendingTitle: boolean;
  refreshSessions: (options?: { preserveCurrent?: boolean }) => Promise<unknown>;
}) {
  const refreshSessionsRef = useRef(refreshSessions);

  useEffect(() => {
    refreshSessionsRef.current = refreshSessions;
  }, [refreshSessions]);

  useEffect(() => {
    if (!hasPendingTitle) return;

    let disposed = false;
    let inFlight = false;
    let failedAttempts = 0;
    let timer: number | undefined;
    const isPageHidden = () => document.visibilityState === "hidden";

    const schedule = (delay: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(run, delay);
    };

    const run = async () => {
      if (disposed || inFlight || isPageHidden()) return;

      inFlight = true;
      try {
        await refreshSessionsRef.current({ preserveCurrent: true });
        failedAttempts = 0;
      } catch (error) {
        failedAttempts += 1;
        console.warn("[session] Failed to refresh pending session titles:", error);
      } finally {
        inFlight = false;
        if (!disposed && !isPageHidden()) {
          schedule(getTitleRefreshDelay(failedAttempts));
        }
      }
    };

    const handleVisibilityChange = () => {
      if (isPageHidden()) {
        window.clearTimeout(timer);
        return;
      }
      void run();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    schedule(0);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [hasPendingTitle]);
}
