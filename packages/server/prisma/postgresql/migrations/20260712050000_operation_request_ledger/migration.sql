DROP INDEX "SheetOperation_sheetId_idempotencyKey_key";
ALTER TABLE "SheetOperation" DROP COLUMN "idempotencyKey";
ALTER TABLE "SheetOperation" DROP COLUMN "result";

CREATE TABLE "SheetOperationRequest" (
    "id" SERIAL NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "result" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SheetOperationRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SheetOperationRequest_sheetId_idempotencyKey_key" ON "SheetOperationRequest"("sheetId", "idempotencyKey");
CREATE INDEX "SheetOperationRequest_sheetId_createdAt_idx" ON "SheetOperationRequest"("sheetId", "createdAt");
ALTER TABLE "SheetOperationRequest" ADD CONSTRAINT "SheetOperationRequest_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
