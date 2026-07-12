-- FormulaCell is a derived index over canonical chunks; rebuild it with coordinates.
DROP TABLE `FormulaCell`;

CREATE TABLE `FormulaCell` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sheetId` INTEGER NOT NULL,
    `row` INTEGER NOT NULL,
    `col` INTEGER NOT NULL,
    `address` VARCHAR(191) NOT NULL,
    `formula` TEXT NOT NULL,
    `ast` BLOB NULL,
    `dependencies` BLOB NULL,
    `cachedValue` BLOB NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `FormulaCell_sheetId_row_col_idx`(`sheetId`, `row`, `col`),
    UNIQUE INDEX `FormulaCell_sheetId_row_col_key`(`sheetId`, `row`, `col`),
    UNIQUE INDEX `FormulaCell_sheetId_address_key`(`sheetId`, `address`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `FormulaDependency` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sourceSheetId` INTEGER NOT NULL,
    `targetSheetId` INTEGER NOT NULL,
    `targetAddress` VARCHAR(191) NOT NULL,
    `startRow` INTEGER NOT NULL,
    `startCol` INTEGER NOT NULL,
    `endRow` INTEGER NOT NULL,
    `endCol` INTEGER NOT NULL,
    INDEX `FormulaDependency_sourceSheetId_startRow_endRow_startCol_endCol_idx`(`sourceSheetId`, `startRow`, `endRow`, `startCol`, `endCol`),
    INDEX `FormulaDependency_targetSheetId_targetAddress_idx`(`targetSheetId`, `targetAddress`),
    UNIQUE INDEX `FormulaDependency_targetSheetId_targetAddress_sourceSheetId_startRow_startCol_endRow_endCol_key`(`targetSheetId`, `targetAddress`, `sourceSheetId`, `startRow`, `startCol`, `endRow`, `endCol`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `FormulaCell` ADD CONSTRAINT `FormulaCell_sheetId_fkey` FOREIGN KEY (`sheetId`) REFERENCES `Sheet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `FormulaDependency` ADD CONSTRAINT `FormulaDependency_sourceSheetId_fkey` FOREIGN KEY (`sourceSheetId`) REFERENCES `Sheet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `FormulaDependency` ADD CONSTRAINT `FormulaDependency_targetSheetId_fkey` FOREIGN KEY (`targetSheetId`) REFERENCES `Sheet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
