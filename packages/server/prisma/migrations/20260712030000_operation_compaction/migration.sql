ALTER TABLE "Sheet" ADD COLUMN "compactedRevision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "SheetSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sheetId" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "maxRow" INTEGER NOT NULL,
    "maxColumn" INTEGER NOT NULL,
    "codec" TEXT NOT NULL DEFAULT 'json-v1',
    "chunks" BLOB NOT NULL,
    "objects" BLOB NOT NULL,
    "layout" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SheetSnapshot_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SheetSnapshot_sheetId_revision_key" ON "SheetSnapshot"("sheetId", "revision");
CREATE INDEX "SheetSnapshot_sheetId_revision_idx" ON "SheetSnapshot"("sheetId", "revision");
