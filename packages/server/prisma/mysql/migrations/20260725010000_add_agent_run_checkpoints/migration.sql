ALTER TABLE `AgentRun` ADD COLUMN `transcriptSequence` INTEGER NOT NULL DEFAULT 0;
UPDATE `AgentRun` SET `transcriptSequence` = `lastEventSequence` WHERE `status` IN ('completed', 'cancelled', 'failed');

CREATE TABLE `AgentRunCheckpoint` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `runId` INTEGER NOT NULL,
  `checkpointSequence` INTEGER NOT NULL,
  `transcript` LONGTEXT NOT NULL,
  `reasoning` LONGTEXT NOT NULL,
  `toolState` LONGTEXT NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `AgentRunCheckpoint_runId_key` (`runId`),
  INDEX `AgentRunCheckpoint_runId_checkpointSequence_idx` (`runId`, `checkpointSequence`),
  CONSTRAINT `AgentRunCheckpoint_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `AgentRun` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
