ALTER TABLE "AgentRun" ADD COLUMN "clientRequestId" TEXT;

CREATE UNIQUE INDEX "AgentRun_clientRequestId_key" ON "AgentRun"("clientRequestId");
