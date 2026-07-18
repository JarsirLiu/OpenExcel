PRAGMA foreign_keys=OFF;

CREATE TABLE "new_UploadAsset" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "publicId" TEXT NOT NULL,
    "workspaceId" INTEGER,
    "storageKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "detectedFormat" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "orphanedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UploadAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_UploadAsset" ("id", "publicId", "workspaceId", "storageKey", "originalFileName", "detectedFormat", "mimeType", "sizeBytes", "sha256", "createdAt")
SELECT "id", "publicId", "workspaceId", "storageKey", "originalFileName", "detectedFormat", "mimeType", "sizeBytes", "sha256", "createdAt"
FROM "UploadAsset";

DROP TABLE "UploadAsset";
ALTER TABLE "new_UploadAsset" RENAME TO "UploadAsset";

CREATE UNIQUE INDEX "UploadAsset_publicId_key" ON "UploadAsset"("publicId");
CREATE INDEX "UploadAsset_workspaceId_idx" ON "UploadAsset"("workspaceId");
CREATE INDEX "UploadAsset_sha256_idx" ON "UploadAsset"("sha256");
CREATE INDEX "UploadAsset_orphanedAt_idx" ON "UploadAsset"("orphanedAt");

PRAGMA foreign_keys=ON;
