-- AlterTable
ALTER TABLE `aiconversation` ADD COLUMN `pinned` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `pinnedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `personalizationprofile` ADD COLUMN `onboardingSkipped` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `onboardingStarted` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `refreshtoken` ADD COLUMN `deviceId` VARCHAR(191) NULL,
    ADD COLUMN `deviceName` VARCHAR(191) NULL,
    ADD COLUMN `deviceType` VARCHAR(191) NULL,
    ADD COLUMN `lastUsedAt` DATETIME(3) NULL;
