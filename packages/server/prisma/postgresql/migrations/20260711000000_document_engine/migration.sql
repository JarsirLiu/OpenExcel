ALTER TABLE "Sheet" ADD COLUMN "documentFormat" TEXT NOT NULL DEFAULT 'fortune-celldata-v1';
ALTER TABLE "Sheet" ADD COLUMN "documentVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Sheet" ADD COLUMN "documentRevision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "SheetChunk" (
    "id" SERIAL NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "rowBlock" INTEGER NOT NULL,
    "colBlock" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "codec" TEXT NOT NULL DEFAULT 'json-v1',
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SheetChunk_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SheetOperation" (
    "id" SERIAL NOT NULL,
    "workbookId" INTEGER NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "actorId" INTEGER,
    "type" TEXT NOT NULL,
    "payload" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SheetOperation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CellStyle" (
    "id" SERIAL NOT NULL,
    "workbookId" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CellStyle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SheetObject" (
    "id" SERIAL NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "position" BYTEA NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SheetObject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FormulaCell" (
    "id" SERIAL NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "formula" TEXT NOT NULL,
    "ast" BYTEA,
    "dependencies" BYTEA,
    "cachedValue" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FormulaCell_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PivotTable" (
    "id" SERIAL NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "source" BYTEA NOT NULL,
    "rows" BYTEA NOT NULL,
    "columns" BYTEA NOT NULL,
    "values" BYTEA NOT NULL,
    "filters" BYTEA NOT NULL,
    "layout" BYTEA,
    "cache" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PivotTable_pkey" PRIMARY KEY ("id")
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

ALTER TABLE "SheetChunk" ADD CONSTRAINT "SheetChunk_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SheetOperation" ADD CONSTRAINT "SheetOperation_workbookId_fkey" FOREIGN KEY ("workbookId") REFERENCES "Workbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SheetOperation" ADD CONSTRAINT "SheetOperation_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CellStyle" ADD CONSTRAINT "CellStyle_workbookId_fkey" FOREIGN KEY ("workbookId") REFERENCES "Workbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SheetObject" ADD CONSTRAINT "SheetObject_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormulaCell" ADD CONSTRAINT "FormulaCell_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PivotTable" ADD CONSTRAINT "PivotTable_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
