import type { Prisma } from "../../../infra/database/prismaTypes.js";
import type { AssetFormat, AssetRecord } from "./asset.js";

export type CreateAssetInput = {
  publicId: string;
  workspaceId: number;
  storageKey: string;
  originalFileName: string;
  detectedFormat: AssetFormat;
  mimeType: string;
};

export type CleanupAsset = Pick<AssetRecord, "id" | "storageKey"> & {
  leaseToken: string;
  attempts: number;
};

export type AssetImportActivator = (
  tx: Prisma.TransactionClient,
  workspaceId: number,
  assetId: number,
) => Promise<void>;

export interface AssetRepository {
  createUploading(input: CreateAssetInput): Promise<AssetRecord>;
  markReady(id: number, content: { sizeBytes: number; sha256: string }): Promise<AssetRecord>;
  beginImport(id: number, workspaceId: number, leaseUntil: Date): Promise<AssetRecord>;
  renewLease(id: number, leaseUntil: Date): Promise<void>;
  markOrphaned(id: number, reason: string): Promise<void>;
  claimCleanupBatch(limit: number, now: Date, leaseMs: number): Promise<readonly CleanupAsset[]>;
  completeCleanup(asset: CleanupAsset): Promise<void>;
  releaseCleanup(asset: CleanupAsset, reason: string, nextAttemptAt: Date): Promise<void>;
  completeImport: AssetImportActivator;
}
