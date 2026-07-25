CREATE TABLE "ChartMutationReceipt" (
    "id" SERIAL NOT NULL,
    "mutationId" TEXT NOT NULL,
    "commandHash" TEXT NOT NULL,
    "mutation" TEXT NOT NULL,
    "chartId" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChartMutationReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChartMutationReceipt_mutationId_key" ON "ChartMutationReceipt"("mutationId");
CREATE INDEX "ChartMutationReceipt_chartId_createdAt_idx" ON "ChartMutationReceipt"("chartId", "createdAt");
