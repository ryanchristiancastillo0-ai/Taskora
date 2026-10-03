-- Customer service / help desk: user-facing support tickets, a rating of the
-- support experience, and the counter that hands out human-quotable ticket
-- numbers.
--
-- This is a new feature, so the DDL is purely additive. No existing row is read,
-- written or re-interpreted, and nothing in the product depends on these tables
-- existing -- if none of them were ever migrated, Taskora would behave exactly
-- as it does today.
--
-- Four decisions here are load-bearing rather than cosmetic:
--
--   1. `SupportRequestStatus` is a real ENUM, unlike AuditLog.action. Ticket
--      state is small, closed, and drives the admin's work queue directly, so a
--      typo'd status is worse than a migration. The "don't add enum values to a
--      hot table" concern that applies to `action` does not apply to a table this
--      new and this small.
--
--   2. `ticketNumber` is UNIQUE and drawn from `SupportCounter`, not computed as
--      MAX(ticketNumber) + 1. Two registrations arriving together would read the
--      same maximum under that scheme, and the loser would fail on the unique
--      index with a 500 the user cannot act on. The counter row is incremented
--      inside the same transaction as the insert, so a rolled-back ticket does
--      not burn a number either.
--
--   3. `description` is NULLABLE with no default. The guided flow already knows
--      the category, issue and problem the user clicked through, so requiring
--      free text would only force every ticket to contain a redundant retype of
--      what the system already recorded.
--
--   4. ON DELETE CASCADE on both user relations, unlike AuditLog's SET NULL. A
--      support ticket is the account's own record of its own problems -- it is
--      personal data belonging to that person, not an audit trail of staff
--      actions, so it should go when the account does.
--
-- `SupportCounter` is created empty and populated lazily by the first ticket's
-- upsert, so its fixed default id ("support") is what addresses the single row
-- forever.

-- AlterTable
--
-- MySQL has no standalone enum type: the list lives inline on the column, so
-- adding a value means restating the whole list. Only the three new members are
-- appended; every existing value keeps its exact position, which matters because
-- an ENUM is stored as an ordinal and reordering the list would silently
-- reinterpret rows already written.
--
-- MODIFY rather than ADD COLUMN because the column already exists and is NOT NULL.
ALTER TABLE `Notification` MODIFY `type` ENUM('TASK_DUE', 'TASK_REMINDER', 'PROJECT_UPDATE', 'AI_SUGGESTION', 'SYSTEM', 'FRIEND_REQUEST', 'NEW_MESSAGE', 'TASK_PATTERN_SUGGESTION', 'NEW_USER', 'NEW_SUPPORT_REQUEST', 'SUPPORT_STATUS_CHANGED') NOT NULL;

-- CreateTable
CREATE TABLE `SupportCounter` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'support',
    `value` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SupportRequest` (
    `id` VARCHAR(191) NOT NULL,
    `ticketNumber` INTEGER NOT NULL,
    `userId` VARCHAR(191) NOT NULL,

    `category` VARCHAR(191) NOT NULL,
    `issue` VARCHAR(191) NOT NULL,
    `problem` VARCHAR(191) NOT NULL,

    `description` TEXT NULL,

    `status` ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED') NOT NULL DEFAULT 'OPEN',

    `resolutionNote` TEXT NULL,

    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `firstRespondedAt` DATETIME(3) NULL,

    INDEX `SupportRequest_userId_idx`(`userId`),
    INDEX `SupportRequest_userId_status_idx`(`userId`, `status`),
    INDEX `SupportRequest_status_idx`(`status`),
    INDEX `SupportRequest_category_idx`(`category`),
    INDEX `SupportRequest_createdAt_idx`(`createdAt`),

    PRIMARY KEY (`id`),
    UNIQUE INDEX `SupportRequest_ticketNumber_key`(`ticketNumber`),
    CONSTRAINT `SupportRequest_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SupportFeedback` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,

    `rating` INTEGER NOT NULL,
    `comment` TEXT NULL,

    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SupportFeedback_userId_idx`(`userId`),
    INDEX `SupportFeedback_createdAt_idx`(`createdAt`),

    PRIMARY KEY (`id`),
    CONSTRAINT `SupportFeedback_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;