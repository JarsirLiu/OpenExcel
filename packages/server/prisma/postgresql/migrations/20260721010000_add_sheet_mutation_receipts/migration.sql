CREATE TABLE "SheetMutationReceipt" (
    "id" SERIAL NOT NULL,
    "mutationId" TEXT NOT NULL,
    "commandHash" TEXT NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "baseRevision" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SheetMutationReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SheetMutationReceipt_mutationId_key" ON "SheetMutationReceipt"("mutationId");
CREATE INDEX "SheetMutationReceipt_sheetId_createdAt_idx" ON "SheetMutationReceipt"("sheetId", "createdAt");
ALTER TABLE "SheetMutationReceipt" ADD CONSTRAINT "SheetMutationReceipt_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
