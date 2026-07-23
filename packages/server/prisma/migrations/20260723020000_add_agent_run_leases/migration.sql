ALTER TABLE "Session" ADD COLUMN "leaseOwnerId" TEXT;
ALTER TABLE "Session" ADD COLUMN "leaseExpiresAt" DATETIME;
ALTER TABLE "Session" ADD COLUMN "leaseHeartbeatAt" DATETIME;
ALTER TABLE "Session" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AgentRun" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "AgentRun" ADD COLUMN "sessionVersion" INTEGER;
ALTER TABLE "AgentRun" ADD COLUMN "leaseExpiresAt" DATETIME;
ALTER TABLE "AgentRun" ADD COLUMN "heartbeatAt" DATETIME;
ALTER TABLE "AgentRun" ADD COLUMN "lastEventSequence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AgentRun" ADD COLUMN "requestPayloadHash" TEXT;

CREATE INDEX "Session_leaseExpiresAt_idx" ON "Session"("leaseExpiresAt");
CREATE INDEX "AgentRun_ownerId_status_idx" ON "AgentRun"("ownerId", "status");
