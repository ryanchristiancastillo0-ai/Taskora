-- AlterTable
ALTER TABLE `Notification` ADD COLUMN `taskSuggestionId` VARCHAR(191) NULL,
    MODIFY `type` ENUM('TASK_DUE', 'TASK_REMINDER', 'PROJECT_UPDATE', 'AI_SUGGESTION', 'SYSTEM', 'FRIEND_REQUEST', 'NEW_MESSAGE', 'TASK_PATTERN_SUGGESTION') NOT NULL;

-- CreateTable
CREATE TABLE `TaskPattern` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `taskTitle` VARCHAR(191) NOT NULL,
    `normalizedTitle` VARCHAR(191) NOT NULL,
    `frequencyType` ENUM('EVERY_DAYS', 'WEEKLY', 'BIWEEKLY', 'MONTHLY') NOT NULL,
    `intervalDays` INTEGER NOT NULL,
    `confidence` DOUBLE NOT NULL,
    `lastOccurrence` VARCHAR(191) NOT NULL,
    `nextOccurrence` VARCHAR(191) NOT NULL,
    `occurrenceCount` INTEGER NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TaskPattern_userId_active_nextOccurrence_idx`(`userId`, `active`, `nextOccurrence`),
    UNIQUE INDEX `TaskPattern_userId_normalizedTitle_key`(`userId`, `normalizedTitle`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaskSuggestion` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `patternId` VARCHAR(191) NOT NULL,
    `suggestedDate` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'ACCEPTED', 'SKIPPED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    `createdTaskId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `respondedAt` DATETIME(3) NULL,

    INDEX `TaskSuggestion_userId_status_idx`(`userId`, `status`),
    INDEX `TaskSuggestion_patternId_idx`(`patternId`),
    INDEX `TaskSuggestion_suggestedDate_idx`(`suggestedDate`),
    UNIQUE INDEX `TaskSuggestion_patternId_suggestedDate_key`(`patternId`, `suggestedDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Notification_taskSuggestionId_idx` ON `Notification`(`taskSuggestionId`);

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_taskSuggestionId_fkey` FOREIGN KEY (`taskSuggestionId`) REFERENCES `TaskSuggestion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskPattern` ADD CONSTRAINT `TaskPattern_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskSuggestion` ADD CONSTRAINT `TaskSuggestion_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskSuggestion` ADD CONSTRAINT `TaskSuggestion_patternId_fkey` FOREIGN KEY (`patternId`) REFERENCES `TaskPattern`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskSuggestion` ADD CONSTRAINT `TaskSuggestion_createdTaskId_fkey` FOREIGN KEY (`createdTaskId`) REFERENCES `Task`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
