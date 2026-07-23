ALTER TABLE "Session" ADD COLUMN "leaseOwnerId" VARCHAR(191);
ALTER TABLE "Session" ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);
ALTER TABLE "Session" ADD COLUMN "leaseHeartbeatAt" TIMESTAMP(3);
ALTER TABLE "Session" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AgentRun" ADD COLUMN "ownerId" VARCHAR(191);
ALTER TABLE "AgentRun" ADD COLUMN "sessionVersion" INTEGER;
ALTER TABLE "AgentRun" ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);
ALTER TABLE "AgentRun" ADD COLUMN "heartbeatAt" TIMESTAMP(3);
ALTER TABLE "AgentRun" ADD COLUMN "lastEventSequence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AgentRun" ADD COLUMN "requestPayloadHash" VARCHAR(191);

CREATE INDEX "Session_leaseExpiresAt_idx" ON "Session"("leaseExpiresAt");
CREATE INDEX "AgentRun_ownerId_status_idx" ON "AgentRun"("ownerId", "status");
