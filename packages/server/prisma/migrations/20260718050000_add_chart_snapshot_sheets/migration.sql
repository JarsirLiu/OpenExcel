CREATE TABLE "AgentRunChartSnapshotSheet" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "snapshotId" INTEGER NOT NULL,
    "sheetId" INTEGER NOT NULL,
    CONSTRAINT "AgentRunChartSnapshotSheet_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "AgentRunChartSnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AgentRunChartSnapshotSheet_snapshotId_sheetId_key" ON "AgentRunChartSnapshotSheet"("snapshotId", "sheetId");
CREATE INDEX "AgentRunChartSnapshotSheet_sheetId_idx" ON "AgentRunChartSnapshotSheet"("sheetId");
