ALTER TABLE "Sheet" ADD COLUMN "compactedRevision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "SheetSnapshot" (
    "id" SERIAL NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "maxRow" INTEGER NOT NULL,
    "maxColumn" INTEGER NOT NULL,
    "codec" TEXT NOT NULL DEFAULT 'json-v1',
    "chunks" BYTEA NOT NULL,
    "objects" BYTEA NOT NULL,
    "layout" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SheetSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SheetSnapshot_sheetId_revision_key" ON "SheetSnapshot"("sheetId", "revision");
CREATE INDEX "SheetSnapshot_sheetId_revision_idx" ON "SheetSnapshot"("sheetId", "revision");
ALTER TABLE "SheetSnapshot" ADD CONSTRAINT "SheetSnapshot_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
