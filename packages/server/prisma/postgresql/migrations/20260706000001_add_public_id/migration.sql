-- Add public identifiers to resources that are addressed through the API.
ALTER TABLE "Workspace" ADD COLUMN "publicId" TEXT;
ALTER TABLE "Workbook" ADD COLUMN "publicId" TEXT;
ALTER TABLE "Session" ADD COLUMN "publicId" TEXT;

UPDATE "Workspace"
SET "publicId" = 'ws_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16)
WHERE "publicId" IS NULL;
UPDATE "Workbook"
SET "publicId" = 'wb_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16)
WHERE "publicId" IS NULL;
UPDATE "Session"
SET "publicId" = 'ss_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16)
WHERE "publicId" IS NULL;

CREATE UNIQUE INDEX "Workspace_publicId_key" ON "Workspace"("publicId");
CREATE UNIQUE INDEX "Workbook_publicId_key" ON "Workbook"("publicId");
CREATE UNIQUE INDEX "Session_publicId_key" ON "Session"("publicId");
