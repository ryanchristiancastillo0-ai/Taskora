-- AlterTable
ALTER TABLE `AIConversation` ADD COLUMN `pinned` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `pinnedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `PersonalizationProfile` ADD COLUMN `onboardingSkipped` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `onboardingStarted` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `RefreshToken` ADD COLUMN `deviceId` VARCHAR(191) NULL,
    ADD COLUMN `deviceName` VARCHAR(191) NULL,
    ADD COLUMN `deviceType` VARCHAR(191) NULL,
    ADD COLUMN `lastUsedAt` DATETIME(3) NULL;
