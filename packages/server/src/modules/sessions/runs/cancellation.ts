import * as runRepo from "./repository.js";

const pollIntervalMs = 1_000;
const controllers = new Map<number, Set<AbortController>>();

export interface RunCancellationHandle {
  signal: AbortSignal;
  abort(reason?: unknown): void;
  close(): void;
}

export function registerRunCancellation(runId: number): RunCancellationHandle {
  const controller = new AbortController();
  const runControllers = controllers.get(runId) ?? new Set<AbortController>();
  runControllers.add(controller);
  controllers.set(runId, runControllers);

  let closed = false;
  const poller = setInterval(() => {
    void runRepo
      .isRunCancellationRequested(runId)
      .then((requested) => {
        if (requested && !controller.signal.aborted) controller.abort();
      })
      .catch(() => undefined);
  }, pollIntervalMs);
  poller.unref?.();

  return {
    signal: controller.signal,
    abort(reason?: unknown) {
      if (!controller.signal.aborted) controller.abort(reason);
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(poller);
      runControllers.delete(controller);
      if (runControllers.size === 0) controllers.delete(runId);
    },
  };
}

export function notifyRunCancellation(runId: number) {
  for (const controller of controllers.get(runId) ?? []) {
    if (!controller.signal.aborted) controller.abort();
  }
}
