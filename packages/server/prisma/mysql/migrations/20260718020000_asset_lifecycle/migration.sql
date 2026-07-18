ALTER TABLE `UploadAsset`
    ADD COLUMN `state` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN `cleanupLeaseUntil` DATETIME(3) NULL,
    ADD COLUMN `cleanupLeaseToken` VARCHAR(191) NULL,
    ADD COLUMN `cleanupAttempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `cleanupNextAttemptAt` DATETIME(3) NULL,
    ADD COLUMN `cleanupLastError` TEXT NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

UPDATE `UploadAsset`
SET `state` = CASE WHEN `orphanedAt` IS NULL THEN 'ACTIVE' ELSE 'ORPHANED' END,
    `cleanupNextAttemptAt` = `orphanedAt`;

ALTER TABLE `UploadAsset`
    DROP COLUMN `orphanedAt`;

CREATE INDEX `UploadAsset_state_cleanupNextAttemptAt_idx` ON `UploadAsset`(`state`, `cleanupNextAttemptAt`);
CREATE INDEX `UploadAsset_cleanupLeaseUntil_idx` ON `UploadAsset`(`cleanupLeaseUntil`);
