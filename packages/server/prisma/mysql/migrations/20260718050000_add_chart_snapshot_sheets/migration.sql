CREATE TABLE `AgentRunChartSnapshotSheet` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `snapshotId` INTEGER NOT NULL,
    `sheetId` INTEGER NOT NULL,

    UNIQUE INDEX `AgentRunChartSnapshotSheet_snapshotId_sheetId_key`(`snapshotId`, `sheetId`),
    INDEX `AgentRunChartSnapshotSheet_sheetId_idx`(`sheetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AgentRunChartSnapshotSheet` ADD CONSTRAINT `AgentRunChartSnapshotSheet_snapshotId_fkey` FOREIGN KEY (`snapshotId`) REFERENCES `AgentRunChartSnapshot`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
