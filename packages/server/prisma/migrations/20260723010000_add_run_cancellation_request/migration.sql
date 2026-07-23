ALTER TABLE "AgentRun" ADD COLUMN "cancelRequestedAt" DATETIME;
UPDATE "AgentRun" SET "status" = 'cancelled' WHERE "status" = 'aborted';
UPDATE "AgentRun" SET "status" = 'failed' WHERE "status" = 'error';
