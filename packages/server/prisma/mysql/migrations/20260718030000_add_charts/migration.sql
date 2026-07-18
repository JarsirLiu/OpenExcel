CREATE TABLE `Chart` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `publicId` VARCHAR(191) NOT NULL,
    `workbookId` INTEGER NOT NULL,
    `sheetId` INTEGER NOT NULL,
    `order` INTEGER NOT NULL,
    `spec` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Chart_workbookId_order_idx`(`workbookId`, `order`),
    INDEX `Chart_sheetId_idx`(`sheetId`),
    UNIQUE INDEX `Chart_publicId_key`(`publicId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Chart` ADD CONSTRAINT `Chart_workbookId_fkey` FOREIGN KEY (`workbookId`) REFERENCES `Workbook`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Chart` ADD CONSTRAINT `Chart_sheetId_fkey` FOREIGN KEY (`sheetId`) REFERENCES `Sheet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
