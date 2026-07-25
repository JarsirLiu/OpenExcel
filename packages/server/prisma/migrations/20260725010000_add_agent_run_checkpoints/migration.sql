ALTER TABLE "AgentRun" ADD COLUMN "transcriptSequence" INTEGER NOT NULL DEFAULT 0;
UPDATE "AgentRun" SET "transcriptSequence" = "lastEventSequence" WHERE "status" IN ('completed', 'cancelled', 'failed');

CREATE TABLE "AgentRunCheckpoint" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "runId" INTEGER NOT NULL,
  "checkpointSequence" INTEGER NOT NULL,
  "transcript" TEXT NOT NULL,
  "reasoning" TEXT NOT NULL,
  "toolState" TEXT NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "AgentRunCheckpoint_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AgentRunCheckpoint_runId_key" ON "AgentRunCheckpoint"("runId");
CREATE INDEX "AgentRunCheckpoint_runId_checkpointSequence_idx" ON "AgentRunCheckpoint"("runId", "checkpointSequence");
