ALTER TABLE `UploadAsset`
    MODIFY `workspaceId` INTEGER NULL,
    ADD COLUMN `orphanedAt` DATETIME(3) NULL;

ALTER TABLE `UploadAsset` DROP FOREIGN KEY `UploadAsset_workspaceId_fkey`;
ALTER TABLE `UploadAsset` ADD CONSTRAINT `UploadAsset_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX `UploadAsset_orphanedAt_idx` ON `UploadAsset`(`orphanedAt`);
