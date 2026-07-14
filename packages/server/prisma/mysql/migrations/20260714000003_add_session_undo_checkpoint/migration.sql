ALTER TABLE `Session` ADD COLUMN `undoRunId` INTEGER NULL;

CREATE INDEX `Session_workspaceId_undoRunId_idx` ON `Session`(`workspaceId`, `undoRunId`);
