PRAGMA foreign_keys=OFF;

CREATE TABLE "new_UploadAsset" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "publicId" TEXT NOT NULL,
    "workspaceId" INTEGER,
    "state" TEXT NOT NULL DEFAULT 'ACTIVE',
    "storageKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "detectedFormat" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "cleanupLeaseUntil" DATETIME,
    "cleanupLeaseToken" TEXT,
    "cleanupAttempts" INTEGER NOT NULL DEFAULT 0,
    "cleanupNextAttemptAt" DATETIME,
    "cleanupLastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UploadAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_UploadAsset" (
    "id", "publicId", "workspaceId", "state", "storageKey", "originalFileName",
    "detectedFormat", "mimeType", "sizeBytes", "sha256", "cleanupNextAttemptAt",
    "createdAt", "updatedAt"
)
SELECT
    "id", "publicId", "workspaceId",
    CASE WHEN "orphanedAt" IS NULL THEN 'ACTIVE' ELSE 'ORPHANED' END,
    "storageKey", "originalFileName", "detectedFormat", "mimeType", "sizeBytes", "sha256",
    "orphanedAt", "createdAt", "createdAt"
FROM "UploadAsset";

DROP TABLE "UploadAsset";
ALTER TABLE "new_UploadAsset" RENAME TO "UploadAsset";

CREATE UNIQUE INDEX "UploadAsset_publicId_key" ON "UploadAsset"("publicId");
CREATE INDEX "UploadAsset_workspaceId_idx" ON "UploadAsset"("workspaceId");
CREATE INDEX "UploadAsset_sha256_idx" ON "UploadAsset"("sha256");
CREATE INDEX "UploadAsset_state_cleanupNextAttemptAt_idx" ON "UploadAsset"("state", "cleanupNextAttemptAt");
CREATE INDEX "UploadAsset_cleanupLeaseUntil_idx" ON "UploadAsset"("cleanupLeaseUntil");

PRAGMA foreign_keys=ON;
