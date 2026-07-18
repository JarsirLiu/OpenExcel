ALTER TABLE "UploadAsset" ALTER COLUMN "workspaceId" DROP NOT NULL;
ALTER TABLE "UploadAsset" ADD COLUMN "orphanedAt" TIMESTAMP(3);

ALTER TABLE "UploadAsset" DROP CONSTRAINT "UploadAsset_workspaceId_fkey";
ALTER TABLE "UploadAsset" ADD CONSTRAINT "UploadAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "UploadAsset_orphanedAt_idx" ON "UploadAsset"("orphanedAt");
