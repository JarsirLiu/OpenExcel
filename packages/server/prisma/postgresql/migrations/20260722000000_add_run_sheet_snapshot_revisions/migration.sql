ALTER TABLE "AgentRunSheetSnapshot" ADD COLUMN "beforeRevision" INTEGER;
ALTER TABLE "AgentRunSheetSnapshot" ADD COLUMN "afterRevision" INTEGER;
ALTER TABLE "AgentRunSheetSnapshot" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'created';

UPDATE "AgentRun"
SET "undoInvalidated" = true
WHERE "id" IN (
  SELECT "runId"
  FROM "AgentRunSheetSnapshot"
  WHERE "beforeRevision" IS NULL OR "afterRevision" IS NULL
);
UPDATE "Session"
SET "undoRunId" = NULL
WHERE "undoRunId" IN (
  SELECT "runId"
  FROM "AgentRunSheetSnapshot"
  WHERE "beforeRevision" IS NULL OR "afterRevision" IS NULL
);
DELETE FROM "AgentRunSheetSnapshot"
WHERE "beforeRevision" IS NULL OR "afterRevision" IS NULL;
