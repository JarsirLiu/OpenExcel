CREATE TABLE `ChartMutationReceipt` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `mutationId` VARCHAR(191) NOT NULL,
  `commandHash` VARCHAR(191) NOT NULL,
  `mutation` VARCHAR(191) NOT NULL,
  `chartId` VARCHAR(191) NOT NULL,
  `result` LONGTEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ChartMutationReceipt_mutationId_key` (`mutationId`),
  INDEX `ChartMutationReceipt_chartId_createdAt_idx` (`chartId`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
