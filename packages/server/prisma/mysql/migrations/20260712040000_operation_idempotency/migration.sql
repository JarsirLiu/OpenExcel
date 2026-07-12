ALTER TABLE `SheetOperation` ADD COLUMN `batchId` VARCHAR(191) NULL;
ALTER TABLE `SheetOperation` ADD COLUMN `batchIndex` INTEGER NULL;
ALTER TABLE `SheetOperation` ADD COLUMN `idempotencyKey` VARCHAR(191) NULL;
ALTER TABLE `SheetOperation` ADD COLUMN `result` LONGBLOB NULL;

CREATE UNIQUE INDEX `SheetOperation_sheetId_idempotencyKey_key` ON `SheetOperation`(`sheetId`, `idempotencyKey`);
CREATE INDEX `SheetOperation_sheetId_batchId_batchIndex_idx` ON `SheetOperation`(`sheetId`, `batchId`, `batchIndex`);
