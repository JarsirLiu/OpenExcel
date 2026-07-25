ALTER TABLE "AgentRun" ADD COLUMN "transcriptSequence" INTEGER NOT NULL DEFAULT 0;
UPDATE "AgentRun" SET "transcriptSequence" = "lastEventSequence" WHERE "status" IN ('completed', 'cancelled', 'failed');

CREATE TABLE "AgentRunCheckpoint" (
  "id" SERIAL NOT NULL,
  "runId" INTEGER NOT NULL,
  "checkpointSequence" INTEGER NOT NULL,
  "transcript" TEXT NOT NULL,
  "reasoning" TEXT NOT NULL,
  "toolState" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentRunCheckpoint_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AgentRunCheckpoint_runId_key" ON "AgentRunCheckpoint"("runId");
CREATE INDEX "AgentRunCheckpoint_runId_checkpointSequence_idx" ON "AgentRunCheckpoint"("runId", "checkpointSequence");
ALTER TABLE "AgentRunCheckpoint" ADD CONSTRAINT "AgentRunCheckpoint_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
