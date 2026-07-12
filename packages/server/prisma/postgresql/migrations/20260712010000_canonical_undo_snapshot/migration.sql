ALTER TABLE "AgentRunSheetSnapshot" ADD COLUMN "documentRevision" INTEGER;
ALTER TABLE "AgentRunSheetSnapshot" ADD COLUMN "documentMaxRow" INTEGER;
ALTER TABLE "AgentRunSheetSnapshot" ADD COLUMN "documentMaxColumn" INTEGER;
ALTER TABLE "AgentRunSheetSnapshot" ADD COLUMN "documentChunks" BYTEA;
ALTER TABLE "AgentRunSheetSnapshot" ADD COLUMN "documentObjects" BYTEA;
