DROP INDEX "SheetOperation_sheetId_idempotencyKey_key";
ALTER TABLE "SheetOperation" DROP COLUMN "idempotencyKey";
ALTER TABLE "SheetOperation" DROP COLUMN "result";

CREATE TABLE "SheetOperationRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sheetId" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "result" BLOB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SheetOperationRequest_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SheetOperationRequest_sheetId_idempotencyKey_key" ON "SheetOperationRequest"("sheetId", "idempotencyKey");
CREATE INDEX "SheetOperationRequest_sheetId_createdAt_idx" ON "SheetOperationRequest"("sheetId", "createdAt");
