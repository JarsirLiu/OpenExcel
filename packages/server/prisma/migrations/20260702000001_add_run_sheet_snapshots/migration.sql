-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN "revertedAt" DATETIME;

-- CreateTable
CREATE TABLE "AgentRunSheetSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "uploadedData" TEXT,
    "config" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentRunSheetSnapshot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AgentRunSheetSnapshot_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentRunSheetSnapshot_runId_sheetId_key" ON "AgentRunSheetSnapshot"("runId", "sheetId");

-- CreateIndex
CREATE INDEX "AgentRunSheetSnapshot_runId_idx" ON "AgentRunSheetSnapshot"("runId");
