CREATE TABLE "AgentEvent" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "eventId" VARCHAR(191) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" VARCHAR(191) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentToolExecution" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "toolCallId" VARCHAR(191) NOT NULL,
    "toolName" VARCHAR(191) NOT NULL,
    "status" VARCHAR(191) NOT NULL,
    "input" TEXT NOT NULL,
    "output" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentToolExecution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentEvent_eventId_key" ON "AgentEvent"("eventId");
CREATE UNIQUE INDEX "AgentEvent_runId_sequence_key" ON "AgentEvent"("runId", "sequence");
CREATE INDEX "AgentEvent_runId_sequence_idx" ON "AgentEvent"("runId", "sequence");
CREATE UNIQUE INDEX "AgentToolExecution_runId_toolCallId_key" ON "AgentToolExecution"("runId", "toolCallId");
CREATE INDEX "AgentToolExecution_runId_status_idx" ON "AgentToolExecution"("runId", "status");

ALTER TABLE "AgentEvent" ADD CONSTRAINT "AgentEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentToolExecution" ADD CONSTRAINT "AgentToolExecution_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
