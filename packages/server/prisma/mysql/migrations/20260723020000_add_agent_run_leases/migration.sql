ALTER TABLE `Session` ADD COLUMN `leaseOwnerId` VARCHAR(191) NULL;
ALTER TABLE `Session` ADD COLUMN `leaseExpiresAt` DATETIME(3) NULL;
ALTER TABLE `Session` ADD COLUMN `leaseHeartbeatAt` DATETIME(3) NULL;
ALTER TABLE `Session` ADD COLUMN `version` INTEGER NOT NULL DEFAULT 0;

ALTER TABLE `AgentRun` ADD COLUMN `ownerId` VARCHAR(191) NULL;
ALTER TABLE `AgentRun` ADD COLUMN `sessionVersion` INTEGER NULL;
ALTER TABLE `AgentRun` ADD COLUMN `leaseExpiresAt` DATETIME(3) NULL;
ALTER TABLE `AgentRun` ADD COLUMN `heartbeatAt` DATETIME(3) NULL;
ALTER TABLE `AgentRun` ADD COLUMN `lastEventSequence` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `AgentRun` ADD COLUMN `requestPayloadHash` VARCHAR(191) NULL;

CREATE INDEX `Session_leaseExpiresAt_idx` ON `Session`(`leaseExpiresAt`);
CREATE INDEX `AgentRun_ownerId_status_idx` ON `AgentRun`(`ownerId`, `status`);
