import type { Prisma } from "../../../infra/database/prismaTypes.js";
import { generatePublicId } from "../../../shared/utils/publicId.js";
import {
  ASSET_STATES,
  type AssetRecord,
  type AssetUploadFile,
  assetStorageKey,
  describeAssetUpload,
  type StagedAsset,
} from "../domain/asset.js";
import type { AssetImportActivator, AssetRepository } from "../domain/assetRepository.js";
import type { AssetStorage } from "../domain/assetStorage.js";
import { assetRepository } from "../infrastructure/assetRepository.js";

export interface AssetService {
  stageUpload(workspaceId: number, file: AssetUploadFile): Promise<StagedAsset>;
  beginImport(assetId: number, workspaceId: number): Promise<AssetRecord>;
  read(asset: AssetRecord): Promise<Uint8Array>;
  markOrphaned(assetId: number, reason: string): Promise<void>;
  withAssetLease<T>(assetId: number, action: () => Promise<T>): Promise<T>;
  completeImport: AssetImportActivator;
}

const STAGING_LEASE_MS = 60 * 60_000;
const STAGING_HEARTBEAT_MS = 30_000;

export function createAssetService(
  storage: AssetStorage,
  repository: AssetRepository = assetRepository,
): AssetService {
  async function withAssetLease<T>(assetId: number, action: () => Promise<T>): Promise<T> {
    const renew = () =>
      repository
        .renewLease(assetId, new Date(Date.now() + STAGING_LEASE_MS))
        .catch(() => undefined);
    await renew();
    const timer = setInterval(renew, STAGING_HEARTBEAT_MS);
    timer.unref?.();
    try {
      return await action();
    } finally {
      clearInterval(timer);
    }
  }

  return {
    async stageUpload(workspaceId, file) {
      const description = describeAssetUpload(file.filename, file.mimetype);
      const publicId = generatePublicId("asset");
      const storageKey = assetStorageKey(workspaceId, publicId, description.detectedFormat);
      const asset = await repository.createUploading({
        publicId,
        workspaceId,
        storageKey,
        ...description,
      });

      try {
        return await withAssetLease(asset.id, async () => {
          const content = await storage.write(storageKey, description.detectedFormat, file);
          const ready = await repository.markReady(asset.id, content);
          return { ...ready, state: ASSET_STATES.ready } as StagedAsset;
        });
      } catch (error) {
        await repository
          .markOrphaned(asset.id, error instanceof Error ? error.message : "上传失败")
          .catch(() => undefined);
        throw error;
      }
    },

    beginImport(assetId, workspaceId) {
      return repository.beginImport(assetId, workspaceId, new Date(Date.now() + STAGING_LEASE_MS));
    },

    read(asset) {
      return storage.read(asset.storageKey);
    },

    markOrphaned(assetId, reason) {
      return repository.markOrphaned(assetId, reason);
    },

    withAssetLease,
    completeImport: (tx: Prisma.TransactionClient, workspaceId: number, assetId: number) =>
      repository.completeImport(tx, workspaceId, assetId),
  };
}
