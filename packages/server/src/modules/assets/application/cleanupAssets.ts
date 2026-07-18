import type { AssetRepository, CleanupAsset } from "../domain/assetRepository.js";
import type { AssetStorage } from "../domain/assetStorage.js";
import { assetRepository } from "../infrastructure/assetRepository.js";

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_CONCURRENCY = 8;
const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_LEASE_MS = 5 * 60_000;
const DEFAULT_RETRY_BASE_MS = 30_000;

export type AssetCleanupOptions = {
  batchSize?: number;
  concurrency?: number;
  intervalMs?: number;
  leaseMs?: number;
};

export type AssetCleanupWorker = {
  runOnce(): Promise<void>;
  start(): void;
  stop(): Promise<void>;
};

export function createAssetCleanupWorker(
  storage: AssetStorage,
  repository: AssetRepository = assetRepository,
  options: AssetCleanupOptions = {},
): AssetCleanupWorker {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
  let timer: ReturnType<typeof setInterval> | undefined;
  let running: Promise<void> | undefined;

  async function processAsset(asset: CleanupAsset) {
    try {
      await storage.delete(asset.storageKey);
      await repository.completeCleanup(asset);
    } catch (error) {
      const delay = DEFAULT_RETRY_BASE_MS * 2 ** Math.min(asset.attempts, 8);
      await repository.releaseCleanup(
        asset,
        error instanceof Error ? error.message : "资产清理失败",
        new Date(Date.now() + delay),
      );
    }
  }

  async function runOnce() {
    if (running) return running;
    running = (async () => {
      const now = new Date();
      const assets = await repository.claimCleanupBatch(batchSize, now, leaseMs);
      if (assets.length === 0) return;

      let nextIndex = 0;
      const workers = Math.min(Math.max(1, concurrency), assets.length);
      await Promise.all(
        Array.from({ length: workers }, async () => {
          while (nextIndex < assets.length) {
            const asset = assets[nextIndex++];
            if (!asset) return;
            await processAsset(asset);
          }
        }),
      );
    })().finally(() => {
      running = undefined;
    });
    return running;
  }

  return {
    runOnce,
    start() {
      if (timer) return;
      void runOnce().catch((error) => console.error("[asset] cleanup worker failed", error));
      timer = setInterval(
        () =>
          void runOnce().catch((error) => console.error("[asset] cleanup worker failed", error)),
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
