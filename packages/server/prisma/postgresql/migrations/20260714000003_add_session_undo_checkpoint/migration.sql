ALTER TABLE "Session" ADD COLUMN "undoRunId" INTEGER;

CREATE INDEX "Session_workspaceId_undoRunId_idx" ON "Session"("workspaceId", "undoRunId");
