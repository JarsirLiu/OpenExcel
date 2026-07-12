ALTER TABLE "SheetOperation" ADD COLUMN "batchId" TEXT;
ALTER TABLE "SheetOperation" ADD COLUMN "batchIndex" INTEGER;
ALTER TABLE "SheetOperation" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "SheetOperation" ADD COLUMN "result" BLOB;

CREATE UNIQUE INDEX "SheetOperation_sheetId_idempotencyKey_key" ON "SheetOperation"("sheetId", "idempotencyKey");
CREATE INDEX "SheetOperation_sheetId_batchId_batchIndex_idx" ON "SheetOperation"("sheetId", "batchId", "batchIndex");
