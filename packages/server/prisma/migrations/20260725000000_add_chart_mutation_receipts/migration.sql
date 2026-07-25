CREATE TABLE "ChartMutationReceipt" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mutationId" TEXT NOT NULL,
    "commandHash" TEXT NOT NULL,
    "mutation" TEXT NOT NULL,
    "chartId" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ChartMutationReceipt_mutationId_key" ON "ChartMutationReceipt"("mutationId");
CREATE INDEX "ChartMutationReceipt_chartId_createdAt_idx" ON "ChartMutationReceipt"("chartId", "createdAt");
