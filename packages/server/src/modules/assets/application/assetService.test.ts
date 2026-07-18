import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ASSET_STATES, type AssetRecord } from "../domain/asset.js";
import type { AssetRepository } from "../domain/assetRepository.js";
import type { AssetStorage } from "../domain/assetStorage.js";
import { createAssetService } from "./assetService.js";

function repositoryMock(): AssetRepository {
  return {
    createUploading: vi.fn(async (input) => ({
      id: 1,
      ...input,
      workspaceId: input.workspaceId,
      sizeBytes: 0,
      sha256: "",
      state: ASSET_STATES.uploading,
    })),
    markReady: vi.fn(async (_id, content) => ({
      id: 1,
      publicId: "asset_test",
      workspaceId: 7,
      storageKey: "uploads/7/asset_test/original.xlsx",
      originalFileName: "预算.xlsx",
      detectedFormat: "xlsx",
      mimeType: "application/octet-stream",
      ...content,
      state: ASSET_STATES.ready,
    })),
    markOrphaned: vi.fn(async () => undefined),
    beginImport: vi.fn(
      async (id: number, workspaceId: number): Promise<AssetRecord> => ({
        id,
        publicId: "asset_test",
        workspaceId,
        storageKey: "uploads/7/asset_test/original.xlsx",
        originalFileName: "预算.xlsx",
        detectedFormat: "xlsx",
        mimeType: "application/octet-stream",
        sizeBytes: 4,
        sha256: "hash",
        state: ASSET_STATES.importing,
      }),
    ),
    renewLease: vi.fn(async () => undefined),
    claimCleanupBatch: vi.fn(async () => []),
    completeCleanup: vi.fn(async () => undefined),
    releaseCleanup: vi.fn(async () => undefined),
    completeImport: vi.fn(async () => undefined),
  };
}

describe("createAssetService", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("registers the asset before writing the object and activates it after staging", async () => {
    const repository = repositoryMock();
    const storage: AssetStorage = {
      write: vi.fn(async () => ({ sizeBytes: 4, sha256: "hash" })),
      read: vi.fn(),
      delete: vi.fn(),
    };
    const staged = await createAssetService(storage, repository).stageUpload(7, {
      filename: "预算.xlsx",
      mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      file: Readable.from([Buffer.from("data")]),
    });

    expect(repository.createUploading).toHaveBeenCalledBefore(
      storage.write as ReturnType<typeof vi.fn>,
    );
    expect(storage.write).toHaveBeenCalledWith(
      expect.stringMatching(/^uploads\/7\/asset_[^/]+\/original\.xlsx$/),
      "xlsx",
      expect.anything(),
    );
    expect(staged.state).toBe(ASSET_STATES.ready);
  });

  it("keeps a database record when object storage fails", async () => {
    const repository = repositoryMock();
    const storage: AssetStorage = {
      write: vi.fn(async () => Promise.reject(new Error("disk unavailable"))),
      read: vi.fn(),
      delete: vi.fn(),
    };

    await expect(
      createAssetService(storage, repository).stageUpload(7, {
        filename: "预算.xlsx",
        mimetype: "application/octet-stream",
        file: Readable.from([Buffer.from("data")]),
      }),
    ).rejects.toThrow("disk unavailable");
    expect(repository.markOrphaned).toHaveBeenCalledWith(1, "disk unavailable");
  });
});
