ALTER TABLE `AgentRun` ADD COLUMN `cancelRequestedAt` DATETIME(3) NULL;
UPDATE `AgentRun` SET `status` = 'cancelled' WHERE `status` = 'aborted';
UPDATE `AgentRun` SET `status` = 'failed' WHERE `status` = 'error';
