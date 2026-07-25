import { findStaleRunningRuns, markStaleRunForRecovery } from "./repository.js";

export type StaleRun = Awaited<ReturnType<typeof findStaleRunningRuns>>[number];

export type RunRecoveryWorkerOptions = {
  intervalMs?: number;
  afterMarked?: (run: StaleRun) => Promise<void>;
};

export type RunRecoveryWorker = {
  runOnce(): Promise<number>;
  start(): void;
  stop(): Promise<void>;
};

export function createRunRecoveryWorker(options: RunRecoveryWorkerOptions = {}): RunRecoveryWorker {
  const intervalMs = options.intervalMs ?? 30_000;
  let timer: ReturnType<typeof setInterval> | undefined;
  let running: Promise<number> | undefined;

  async function runOnce() {
    if (running) return running;
    running = (async () => {
      const staleRuns = await findStaleRunningRuns();
      let recovered = 0;
      for (const run of staleRuns) {
        const result = await markStaleRunForRecovery(run);
        recovered += result.count;
        if (result.count === 1) await options.afterMarked?.(run);
      }
      return recovered;
    })().finally(() => {
      running = undefined;
    });
    return running;
  }

  return {
    runOnce,
    start() {
      if (timer) return;
      void runOnce().catch((error) => console.error("[session] run recovery worker failed", error));
      timer = setInterval(
        () =>
          void runOnce().catch((error) =>
            console.error("[session] run recovery worker failed", error),
          ),
        intervalMs,
      );
      timer.unref?.();
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      await running;
    },
  };
}
