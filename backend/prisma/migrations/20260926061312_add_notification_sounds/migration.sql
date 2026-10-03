-- AlterTable
ALTER TABLE `notificationsettings` ADD COLUMN `notificationSoundId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `NotificationSound` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `path` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `NotificationSound_path_key`(`path`),
    INDEX `NotificationSound_isDefault_idx`(`isDefault`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `NotificationSettings_notificationSoundId_idx` ON `NotificationSettings`(`notificationSoundId`);

-- AddForeignKey
ALTER TABLE `NotificationSettings` ADD CONSTRAINT `NotificationSettings_notificationSoundId_fkey` FOREIGN KEY (`notificationSoundId`) REFERENCES `NotificationSound`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
