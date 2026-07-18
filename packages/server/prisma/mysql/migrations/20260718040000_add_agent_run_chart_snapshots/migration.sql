CREATE TABLE `AgentRunChartSnapshot` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `runId` INTEGER NOT NULL,
    `chartId` VARCHAR(191) NOT NULL,
    `workbookId` INTEGER NOT NULL,
    `sheetId` INTEGER NOT NULL,
    `order` INTEGER NOT NULL,
    `spec` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AgentRunChartSnapshot_runId_chartId_key`(`runId`, `chartId`),
    INDEX `AgentRunChartSnapshot_runId_idx`(`runId`),
    INDEX `AgentRunChartSnapshot_sheetId_idx`(`sheetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AgentRunChartSnapshot` ADD CONSTRAINT `AgentRunChartSnapshot_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `AgentRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
