-- Add the versioned OpenExcel document layer without removing the Fortune data.
ALTER TABLE "Sheet" ADD COLUMN "documentFormat" TEXT NOT NULL DEFAULT 'fortune-celldata-v1';
ALTER TABLE "Sheet" ADD COLUMN "documentVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Sheet" ADD COLUMN "documentRevision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "SheetChunk" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sheetId" INTEGER NOT NULL,
    "rowBlock" INTEGER NOT NULL,
    "colBlock" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "codec" TEXT NOT NULL DEFAULT 'json-v1',
    "data" BLOB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SheetChunk_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "SheetOperation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workbookId" INTEGER NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "actorId" INTEGER,
    "type" TEXT NOT NULL,
    "payload" BLOB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SheetOperation_workbookId_fkey" FOREIGN KEY ("workbookId") REFERENCES "Workbook" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SheetOperation_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CellStyle" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workbookId" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "data" BLOB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CellStyle_workbookId_fkey" FOREIGN KEY ("workbookId") REFERENCES "Workbook" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "SheetObject" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sheetId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "position" BLOB NOT NULL,
    "data" BLOB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SheetObject_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "FormulaCell" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sheetId" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "formula" TEXT NOT NULL,
    "ast" BLOB,
    "dependencies" BLOB,
    "cachedValue" BLOB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FormulaCell_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "PivotTable" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sheetId" INTEGER NOT NULL,
    "source" BLOB NOT NULL,
    "rows" BLOB NOT NULL,
    "columns" BLOB NOT NULL,
    "values" BLOB NOT NULL,
    "filters" BLOB NOT NULL,
    "layout" BLOB,
    "cache" BLOB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PivotTable_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SheetChunk_sheetId_rowBlock_colBlock_key" ON "SheetChunk"("sheetId", "rowBlock", "colBlock");
CREATE INDEX "SheetChunk_sheetId_rowBlock_idx" ON "SheetChunk"("sheetId", "rowBlock");
CREATE INDEX "SheetChunk_sheetId_colBlock_idx" ON "SheetChunk"("sheetId", "colBlock");
CREATE UNIQUE INDEX "SheetOperation_sheetId_revision_key" ON "SheetOperation"("sheetId", "revision");
CREATE INDEX "SheetOperation_sheetId_revision_idx" ON "SheetOperation"("sheetId", "revision");
CREATE INDEX "SheetOperation_workbookId_createdAt_idx" ON "SheetOperation"("workbookId", "createdAt");
CREATE UNIQUE INDEX "CellStyle_workbookId_hash_key" ON "CellStyle"("workbookId", "hash");
CREATE INDEX "CellStyle_workbookId_idx" ON "CellStyle"("workbookId");
CREATE INDEX "SheetObject_sheetId_type_idx" ON "SheetObject"("sheetId", "type");
CREATE UNIQUE INDEX "FormulaCell_sheetId_address_key" ON "FormulaCell"("sheetId", "address");
CREATE INDEX "FormulaCell_sheetId_idx" ON "FormulaCell"("sheetId");
CREATE INDEX "PivotTable_sheetId_idx" ON "PivotTable"("sheetId");
