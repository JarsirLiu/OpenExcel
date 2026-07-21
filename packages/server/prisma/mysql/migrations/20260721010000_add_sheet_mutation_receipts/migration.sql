CREATE TABLE `SheetMutationReceipt` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mutationId` VARCHAR(191) NOT NULL,
    `commandHash` VARCHAR(191) NOT NULL,
    `sheetId` INTEGER NOT NULL,
    `baseRevision` INTEGER NOT NULL,
    `revision` INTEGER NOT NULL,
    `result` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `SheetMutationReceipt_mutationId_key` (`mutationId`),
    INDEX `SheetMutationReceipt_sheetId_createdAt_idx` (`sheetId`, `createdAt`),
    CONSTRAINT `SheetMutationReceipt_sheetId_fkey` FOREIGN KEY (`sheetId`) REFERENCES `Sheet` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
