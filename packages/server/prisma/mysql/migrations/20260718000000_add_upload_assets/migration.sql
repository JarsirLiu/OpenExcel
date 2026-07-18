-- CreateTable
CREATE TABLE `UploadAsset` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `publicId` VARCHAR(191) NOT NULL,
    `workspaceId` INTEGER NOT NULL,
    `storageKey` VARCHAR(191) NOT NULL,
    `originalFileName` VARCHAR(191) NOT NULL,
    `detectedFormat` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `sha256` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `Workbook` ADD COLUMN `sourceAssetId` INTEGER NULL;

-- CreateIndex
CREATE UNIQUE INDEX `UploadAsset_publicId_key` ON `UploadAsset`(`publicId`);
CREATE INDEX `UploadAsset_workspaceId_idx` ON `UploadAsset`(`workspaceId`);
CREATE INDEX `UploadAsset_sha256_idx` ON `UploadAsset`(`sha256`);
CREATE INDEX `Workbook_sourceAssetId_idx` ON `Workbook`(`sourceAssetId`);

-- AddForeignKey
ALTER TABLE `UploadAsset` ADD CONSTRAINT `UploadAsset_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Workbook` ADD CONSTRAINT `Workbook_sourceAssetId_fkey` FOREIGN KEY (`sourceAssetId`) REFERENCES `UploadAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
