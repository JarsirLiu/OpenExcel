ALTER TABLE `Sheet` ADD COLUMN `compactedRevision` INTEGER NOT NULL DEFAULT 0;

CREATE TABLE `SheetSnapshot` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sheetId` INTEGER NOT NULL,
    `revision` INTEGER NOT NULL,
    `maxRow` INTEGER NOT NULL,
    `maxColumn` INTEGER NOT NULL,
    `codec` VARCHAR(191) NOT NULL DEFAULT 'json-v1',
    `chunks` LONGBLOB NOT NULL,
    `objects` LONGBLOB NOT NULL,
    `layout` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `SheetSnapshot_sheetId_revision_key`(`sheetId`, `revision`),
    INDEX `SheetSnapshot_sheetId_revision_idx`(`sheetId`, `revision`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SheetSnapshot` ADD CONSTRAINT `SheetSnapshot_sheetId_fkey` FOREIGN KEY (`sheetId`) REFERENCES `Sheet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
