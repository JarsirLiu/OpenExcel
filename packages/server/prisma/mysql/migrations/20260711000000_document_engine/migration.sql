ALTER TABLE `Sheet` ADD COLUMN `documentFormat` VARCHAR(191) NOT NULL DEFAULT 'fortune-celldata-v1';
ALTER TABLE `Sheet` ADD COLUMN `documentVersion` INTEGER NOT NULL DEFAULT 1;
ALTER TABLE `Sheet` ADD COLUMN `documentRevision` INTEGER NOT NULL DEFAULT 0;

CREATE TABLE `SheetChunk` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sheetId` INTEGER NOT NULL,
    `rowBlock` INTEGER NOT NULL,
    `colBlock` INTEGER NOT NULL,
    `revision` INTEGER NOT NULL,
    `codec` VARCHAR(191) NOT NULL DEFAULT 'json-v1',
    `data` BLOB NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `SheetChunk_sheetId_rowBlock_idx`(`sheetId`, `rowBlock`),
    INDEX `SheetChunk_sheetId_colBlock_idx`(`sheetId`, `colBlock`),
    UNIQUE INDEX `SheetChunk_sheetId_rowBlock_colBlock_key`(`sheetId`, `rowBlock`, `colBlock`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SheetOperation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `workbookId` INTEGER NOT NULL,
    `sheetId` INTEGER NOT NULL,
    `revision` INTEGER NOT NULL,
    `actorId` INTEGER NULL,
    `type` VARCHAR(191) NOT NULL,
    `payload` BLOB NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `SheetOperation_sheetId_revision_idx`(`sheetId`, `revision`),
    INDEX `SheetOperation_workbookId_createdAt_idx`(`workbookId`, `createdAt`),
    UNIQUE INDEX `SheetOperation_sheetId_revision_key`(`sheetId`, `revision`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CellStyle` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `workbookId` INTEGER NOT NULL,
    `hash` VARCHAR(191) NOT NULL,
    `data` BLOB NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `CellStyle_workbookId_idx`(`workbookId`),
    UNIQUE INDEX `CellStyle_workbookId_hash_key`(`workbookId`, `hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SheetObject` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sheetId` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `position` BLOB NOT NULL,
    `data` BLOB NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `SheetObject_sheetId_type_idx`(`sheetId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `FormulaCell` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sheetId` INTEGER NOT NULL,
    `address` VARCHAR(191) NOT NULL,
    `formula` TEXT NOT NULL,
    `ast` BLOB NULL,
    `dependencies` BLOB NULL,
    `cachedValue` BLOB NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `FormulaCell_sheetId_idx`(`sheetId`),
    UNIQUE INDEX `FormulaCell_sheetId_address_key`(`sheetId`, `address`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PivotTable` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sheetId` INTEGER NOT NULL,
    `source` BLOB NOT NULL,
    `rows` BLOB NOT NULL,
    `columns` BLOB NOT NULL,
    `values` BLOB NOT NULL,
    `filters` BLOB NOT NULL,
    `layout` BLOB NULL,
    `cache` BLOB NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `PivotTable_sheetId_idx`(`sheetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SheetChunk` ADD CONSTRAINT `SheetChunk_sheetId_fkey` FOREIGN KEY (`sheetId`) REFERENCES `Sheet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SheetOperation` ADD CONSTRAINT `SheetOperation_workbookId_fkey` FOREIGN KEY (`workbookId`) REFERENCES `Workbook`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SheetOperation` ADD CONSTRAINT `SheetOperation_sheetId_fkey` FOREIGN KEY (`sheetId`) REFERENCES `Sheet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `CellStyle` ADD CONSTRAINT `CellStyle_workbookId_fkey` FOREIGN KEY (`workbookId`) REFERENCES `Workbook`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SheetObject` ADD CONSTRAINT `SheetObject_sheetId_fkey` FOREIGN KEY (`sheetId`) REFERENCES `Sheet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `FormulaCell` ADD CONSTRAINT `FormulaCell_sheetId_fkey` FOREIGN KEY (`sheetId`) REFERENCES `Sheet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `PivotTable` ADD CONSTRAINT `PivotTable_sheetId_fkey` FOREIGN KEY (`sheetId`) REFERENCES `Sheet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
