DROP INDEX `SheetOperation_sheetId_idempotencyKey_key` ON `SheetOperation`;
ALTER TABLE `SheetOperation` DROP COLUMN `idempotencyKey`;
ALTER TABLE `SheetOperation` DROP COLUMN `result`;

CREATE TABLE `SheetOperationRequest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sheetId` INTEGER NOT NULL,
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `revision` INTEGER NOT NULL,
    `result` LONGBLOB NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `SheetOperationRequest_sheetId_idempotencyKey_key`(`sheetId`, `idempotencyKey`),
    INDEX `SheetOperationRequest_sheetId_createdAt_idx`(`sheetId`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SheetOperationRequest` ADD CONSTRAINT `SheetOperationRequest_sheetId_fkey` FOREIGN KEY (`sheetId`) REFERENCES `Sheet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
