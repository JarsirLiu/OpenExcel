CREATE TABLE "AgentRunChartSnapshotSheet" (
    "id" SERIAL NOT NULL,
    "snapshotId" INTEGER NOT NULL,
    "sheetId" INTEGER NOT NULL,

    CONSTRAINT "AgentRunChartSnapshotSheet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentRunChartSnapshotSheet_snapshotId_sheetId_key" ON "AgentRunChartSnapshotSheet"("snapshotId", "sheetId");
CREATE INDEX "AgentRunChartSnapshotSheet_sheetId_idx" ON "AgentRunChartSnapshotSheet"("sheetId");

ALTER TABLE "AgentRunChartSnapshotSheet" ADD CONSTRAINT "AgentRunChartSnapshotSheet_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "AgentRunChartSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
