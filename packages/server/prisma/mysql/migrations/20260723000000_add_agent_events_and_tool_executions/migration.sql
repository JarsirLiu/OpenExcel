CREATE TABLE `AgentEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `runId` INTEGER NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `sequence` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `occurredAt` DATETIME(3) NOT NULL,
    `payload` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    CONSTRAINT `AgentEvent_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `AgentRun` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AgentToolExecution` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `runId` INTEGER NOT NULL,
    `toolCallId` VARCHAR(191) NOT NULL,
    `toolName` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `input` LONGTEXT NOT NULL,
    `output` LONGTEXT NULL,
    `errorMessage` TEXT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    CONSTRAINT `AgentToolExecution_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `AgentRun` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `AgentEvent_eventId_key` ON `AgentEvent`(`eventId`);
CREATE UNIQUE INDEX `AgentEvent_runId_sequence_key` ON `AgentEvent`(`runId`, `sequence`);
CREATE INDEX `AgentEvent_runId_sequence_idx` ON `AgentEvent`(`runId`, `sequence`);
CREATE UNIQUE INDEX `AgentToolExecution_runId_toolCallId_key` ON `AgentToolExecution`(`runId`, `toolCallId`);
CREATE INDEX `AgentToolExecution_runId_status_idx` ON `AgentToolExecution`(`runId`, `status`);
