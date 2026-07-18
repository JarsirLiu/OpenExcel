ALTER TABLE "UploadAsset" ADD COLUMN "state" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "UploadAsset" ADD COLUMN "cleanupLeaseUntil" TIMESTAMP(3);
ALTER TABLE "UploadAsset" ADD COLUMN "cleanupLeaseToken" TEXT;
ALTER TABLE "UploadAsset" ADD COLUMN "cleanupAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UploadAsset" ADD COLUMN "cleanupNextAttemptAt" TIMESTAMP(3);
ALTER TABLE "UploadAsset" ADD COLUMN "cleanupLastError" TEXT;
ALTER TABLE "UploadAsset" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "UploadAsset"
SET "state" = CASE WHEN "orphanedAt" IS NULL THEN 'ACTIVE' ELSE 'ORPHANED' END,
    "cleanupNextAttemptAt" = "orphanedAt";

ALTER TABLE "UploadAsset" DROP COLUMN "orphanedAt";
ALTER TABLE "UploadAsset" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE INDEX "UploadAsset_state_cleanupNextAttemptAt_idx" ON "UploadAsset"("state", "cleanupNextAttemptAt");
CREATE INDEX "UploadAsset_cleanupLeaseUntil_idx" ON "UploadAsset"("cleanupLeaseUntil");
