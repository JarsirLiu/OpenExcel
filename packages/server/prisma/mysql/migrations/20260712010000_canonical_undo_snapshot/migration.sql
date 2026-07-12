ALTER TABLE `AgentRunSheetSnapshot` ADD COLUMN `documentRevision` INT NULL;
ALTER TABLE `AgentRunSheetSnapshot` ADD COLUMN `documentMaxRow` INT NULL;
ALTER TABLE `AgentRunSheetSnapshot` ADD COLUMN `documentMaxColumn` INT NULL;
ALTER TABLE `AgentRunSheetSnapshot` ADD COLUMN `documentChunks` BLOB NULL;
ALTER TABLE `AgentRunSheetSnapshot` ADD COLUMN `documentObjects` BLOB NULL;
