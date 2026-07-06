-- Add publicId columns to Workspace, Workbook, Session
ALTER TABLE "Workspace" ADD COLUMN "publicId" TEXT;
ALTER TABLE "Workbook" ADD COLUMN "publicId" TEXT;
ALTER TABLE "Session" ADD COLUMN "publicId" TEXT;

-- Backfill existing records with opaque public IDs
UPDATE "Workspace" SET "publicId" = 'ws_' || lower(hex(randomblob(8))) WHERE "publicId" IS NULL;
UPDATE "Workbook" SET "publicId" = 'wb_' || lower(hex(randomblob(8))) WHERE "publicId" IS NULL;
UPDATE "Session" SET "publicId" = 'ss_' || lower(hex(randomblob(8))) WHERE "publicId" IS NULL;

-- Create unique indexes for publicId lookups
CREATE UNIQUE INDEX "Workspace_publicId_key" ON "Workspace"("publicId");
CREATE UNIQUE INDEX "Workbook_publicId_key" ON "Workbook"("publicId");
CREATE UNIQUE INDEX "Session_publicId_key" ON "Session"("publicId");