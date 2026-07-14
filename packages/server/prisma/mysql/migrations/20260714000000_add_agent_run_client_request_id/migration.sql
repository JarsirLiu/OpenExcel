ALTER TABLE `AgentRun` ADD COLUMN `clientRequestId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `AgentRun_clientRequestId_key` ON `AgentRun`(`clientRequestId`);
