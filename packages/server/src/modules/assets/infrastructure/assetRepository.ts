import { randomUUID } from "node:crypto";
import { prisma } from "../../../infra/database/db.js";
import type { Prisma } from "../../../infra/database/prismaTypes.js";
import { ASSET_STATES, type AssetRecord } from "../domain/asset.js";
import type { AssetRepository, CreateAssetInput } from "../domain/assetRepository.js";

const STAGING_RETENTION_MS = 60 * 60_000;
const ACTIVE_UNREFERENCED_RETENTION_MS = 60 * 60_000;

function toAssetRecord(asset: {
  id: number;
  publicId: string;
  workspaceId: number | null;
  storageKey: string;
  originalFileName: string;
  detectedFormat: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  state: string;
}): AssetRecord {
  return {
    ...asset,
    detectedFormat: asset.detectedFormat as AssetRecord["detectedFormat"],
    state: asset.state as AssetRecord["state"],
  };
}

function cleanupCandidates(now: Date) {
  const activeBefore = new Date(now.getTime() - ACTIVE_UNREFERENCED_RETENTION_MS);
  return {
    OR: [
      {
        state: ASSET_STATES.orphaned,
        cleanupNextAttemptAt: { lte: now },
      },
      {
        state: {
          in: [ASSET_STATES.uploading, ASSET_STATES.ready, ASSET_STATES.importing],
        },
        cleanupNextAttemptAt: { lte: now },
      },
      {
        state: ASSET_STATES.active,
        updatedAt: { lte: activeBefore },
        workbooks: { none: {} },
      },
      {
        state: ASSET_STATES.cleaning,
        cleanupLeaseUntil: { lt: now },
      },
    ],
  };
}

export const assetRepository: AssetRepository = {
  async createUploading(input: CreateAssetInput) {
    const asset = await prisma.uploadAsset.create({
      data: {
        ...input,
        state: ASSET_STATES.uploading,
        sizeBytes: 0,
        sha256: "",
        cleanupNextAttemptAt: new Date(Date.now() + STAGING_RETENTION_MS),
      },
    });
    return toAssetRecord(asset);
  },

  async markReady(id, content) {
    const result = await prisma.uploadAsset.updateMany({
      where: { id, state: ASSET_STATES.uploading },
      data: {
        state: ASSET_STATES.ready,
        sizeBytes: content.sizeBytes,
        sha256: content.sha256,
        cleanupNextAttemptAt: new Date(Date.now() + STAGING_RETENTION_MS),
        cleanupLastError: null,
      },
    });
    if (result.count !== 1) throw new Error("上传资产状态已改变，无法完成上传");
    return toAssetRecord(await prisma.uploadAsset.findUniqueOrThrow({ where: { id } }));
  },

  async beginImport(id, workspaceId, leaseUntil) {
    const result = await prisma.uploadAsset.updateMany({
      where: { id, workspaceId, state: ASSET_STATES.ready },
      data: {
        state: ASSET_STATES.importing,
        cleanupNextAttemptAt: leaseUntil,
      },
    });
    if (result.count !== 1) throw new Error("上传资产不存在或当前不可导入");
    return toAssetRecord(await prisma.uploadAsset.findUniqueOrThrow({ where: { id } }));
  },

  async renewLease(id, leaseUntil) {
    await prisma.uploadAsset.updateMany({
      where: {
        id,
        state: {
          in: [ASSET_STATES.uploading, ASSET_STATES.ready, ASSET_STATES.importing],
        },
      },
      data: { cleanupNextAttemptAt: leaseUntil },
    });
  },

  async markOrphaned(id, reason) {
    await prisma.uploadAsset.updateMany({
      where: { id, state: { not: ASSET_STATES.cleaning } },
      data: {
        state: ASSET_STATES.orphaned,
        cleanupNextAttemptAt: new Date(),
        cleanupLastError: reason.slice(0, 2000),
        cleanupLeaseUntil: null,
        cleanupLeaseToken: null,
      },
    });
  },

  async claimCleanupBatch(limit, now, leaseMs) {
    const leaseToken = randomUUID();
    const leaseUntil = new Date(now.getTime() + leaseMs);
    return prisma.$transaction(async (tx) => {
      const candidates = await tx.uploadAsset.findMany({
        where: cleanupCandidates(now),
        orderBy: { updatedAt: "asc" },
        take: limit,
        select: { id: true },
      });
      if (candidates.length === 0) return [];

      const claimed = await tx.uploadAsset.updateMany({
        where: {
          id: { in: candidates.map((asset) => asset.id) },
          OR: [
            {
              state: {
                in: [
                  ASSET_STATES.orphaned,
                  ASSET_STATES.uploading,
                  ASSET_STATES.ready,
                  ASSET_STATES.importing,
                  ASSET_STATES.active,
                ],
              },
            },
            { state: ASSET_STATES.cleaning, cleanupLeaseUntil: { lt: now } },
          ],
        },
        data: {
          state: ASSET_STATES.cleaning,
          cleanupLeaseUntil: leaseUntil,
          cleanupLeaseToken: leaseToken,
          cleanupAttempts: { increment: 1 },
        },
      });
      if (claimed.count === 0) return [];

      return tx.uploadAsset
        .findMany({
          where: { state: ASSET_STATES.cleaning, cleanupLeaseToken: leaseToken },
          select: { id: true, storageKey: true, cleanupAttempts: true },
        })
        .then((assets) =>
          assets.map((asset) => ({
            id: asset.id,
            storageKey: asset.storageKey,
            leaseToken,
            attempts: asset.cleanupAttempts,
          })),
        );
    });
  },

  async completeCleanup(asset) {
    await prisma.uploadAsset.deleteMany({
      where: {
        id: asset.id,
        state: ASSET_STATES.cleaning,
        cleanupLeaseToken: asset.leaseToken,
        workbooks: { none: {} },
      },
    });
  },

  async releaseCleanup(asset, reason, nextAttemptAt) {
    await prisma.uploadAsset.updateMany({
      where: { id: asset.id, state: ASSET_STATES.cleaning, cleanupLeaseToken: asset.leaseToken },
      data: {
        state: ASSET_STATES.orphaned,
        cleanupNextAttemptAt: nextAttemptAt,
        cleanupLastError: reason.slice(0, 2000),
        cleanupLeaseUntil: null,
        cleanupLeaseToken: null,
      },
    });
  },

  async completeImport(tx: Prisma.TransactionClient, workspaceId, assetId) {
    const result = await tx.uploadAsset.updateMany({
      where: { id: assetId, workspaceId, state: ASSET_STATES.importing },
      data: {
        state: ASSET_STATES.active,
        cleanupNextAttemptAt: null,
        cleanupLastError: null,
      },
    });
    if (result.count !== 1) throw new Error("上传资产不存在或状态不可用于导入");
  },
};
