CREATE TABLE "SheetMutationReceipt" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mutationId" TEXT NOT NULL,
    "commandHash" TEXT NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "baseRevision" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SheetMutationReceipt_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SheetMutationReceipt_mutationId_key" ON "SheetMutationReceipt"("mutationId");
CREATE INDEX "SheetMutationReceipt_sheetId_createdAt_idx" ON "SheetMutationReceipt"("sheetId", "createdAt");
