import { describe, expect, it, vi } from "vitest";
import type { AssetRepository } from "../domain/assetRepository.js";
import type { AssetStorage } from "../domain/assetStorage.js";
import { createAssetCleanupWorker } from "./cleanupAssets.js";

function repositoryMock(asset: {
  id: number;
  storageKey: string;
  leaseToken: string;
  attempts: number;
}): AssetRepository {
  return {
    createUploading: vi.fn(),
    markReady: vi.fn(),
    markOrphaned: vi.fn(),
    beginImport: vi.fn(),
    renewLease: vi.fn(),
    claimCleanupBatch: vi.fn(async () => [asset]),
    completeCleanup: vi.fn(async () => undefined),
    releaseCleanup: vi.fn(async () => undefined),
    completeImport: vi.fn(),
  };
}

describe("createAssetCleanupWorker", () => {
  it("deletes storage before finalizing metadata", async () => {
    const asset = {
      id: 1,
      storageKey: "uploads/1/a/original.xlsx",
      leaseToken: "lease",
      attempts: 1,
    };
    const repository = repositoryMock(asset);
    const storage: AssetStorage = {
      write: vi.fn(),
      read: vi.fn(),
      delete: vi.fn(async () => undefined),
    };

    await createAssetCleanupWorker(storage, repository, { batchSize: 1 }).runOnce();

    expect(storage.delete).toHaveBeenCalledWith(asset.storageKey);
    expect(repository.completeCleanup).toHaveBeenCalledWith(asset);
    expect(repository.releaseCleanup).not.toHaveBeenCalled();
  });

  it("releases a lease for retry when storage deletion fails", async () => {
    const asset = {
      id: 1,
      storageKey: "uploads/1/a/original.xlsx",
      leaseToken: "lease",
      attempts: 3,
    };
    const repository = repositoryMock(asset);
    const storage: AssetStorage = {
      write: vi.fn(),
      read: vi.fn(),
      delete: vi.fn(async () => Promise.reject(new Error("storage unavailable"))),
    };

    await createAssetCleanupWorker(storage, repository, { batchSize: 1 }).runOnce();

    expect(repository.completeCleanup).not.toHaveBeenCalled();
    expect(repository.releaseCleanup).toHaveBeenCalledWith(
      asset,
      "storage unavailable",
      expect.any(Date),
    );
  });
});
