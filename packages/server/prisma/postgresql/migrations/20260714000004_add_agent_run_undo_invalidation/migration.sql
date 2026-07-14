ALTER TABLE "AgentRun" ADD COLUMN "undoInvalidated" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "AgentRunSheetSnapshot_sheetId_idx" ON "AgentRunSheetSnapshot"("sheetId");
