-- CreateTable
CREATE TABLE "UploadAsset" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "publicId" TEXT NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "detectedFormat" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UploadAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable
ALTER TABLE "Workbook" ADD COLUMN "sourceAssetId" INTEGER REFERENCES "UploadAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "UploadAsset_publicId_key" ON "UploadAsset"("publicId");
CREATE INDEX "UploadAsset_workspaceId_idx" ON "UploadAsset"("workspaceId");
CREATE INDEX "UploadAsset_sha256_idx" ON "UploadAsset"("sha256");
CREATE INDEX "Workbook_sourceAssetId_idx" ON "Workbook"("sourceAssetId");
