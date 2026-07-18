CREATE TABLE "AgentRunChartSnapshot" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "chartId" TEXT NOT NULL,
    "workbookId" INTEGER NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "spec" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRunChartSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentRunChartSnapshot_runId_chartId_key" ON "AgentRunChartSnapshot"("runId", "chartId");
CREATE INDEX "AgentRunChartSnapshot_runId_idx" ON "AgentRunChartSnapshot"("runId");
CREATE INDEX "AgentRunChartSnapshot_sheetId_idx" ON "AgentRunChartSnapshot"("sheetId");

ALTER TABLE "AgentRunChartSnapshot" ADD CONSTRAINT "AgentRunChartSnapshot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
