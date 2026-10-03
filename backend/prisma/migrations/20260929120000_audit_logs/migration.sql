-- Audit log: a durable record of who did what, for the actions an administrator
-- has to be able to answer for afterwards.
--
-- This is a new table, so it is purely additive. No existing row is read,
-- written or re-interpreted, and nothing in the product depends on this table
-- existing — if it were never migrated, Taskora would behave exactly as it does
-- today.
--
-- Three decisions in this DDL are load-bearing rather than cosmetic:
--
--   1. `userId` is NULLABLE. A failed sign-in is one of the events worth
--      recording and it has no account behind it, because the credentials
--      matched nothing. The attempted address is kept in `details` instead, so a
--      burst of failures is still investigable without a phantom user row per
--      attempt.
--
--   2. ON DELETE SET NULL, not CASCADE. Deleting an account is the most
--      audit-relevant event in the product. A cascade would erase everything
--      that account did in the same statement that recorded the deletion, and
--      an audit trail that a single DELETE can wipe is not one.
--
--   3. `action` and `entity` are VARCHAR, not ENUM. MySQL alters an ENUM with a
--      table rebuild and a lock; adding one audited action should not require
--      that. The human-readable label and tone live in the frontend's shared
--      constants, so the displayed name still has exactly one definition.
--
-- `userAgent` is VARCHAR(512) because a real browser user-agent is routinely
-- longer than the VARCHAR(191) a bare Prisma String maps to on MySQL, and a
-- truncated one loses the device and OS the admin is trying to read.

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `entity` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `details` JSON NULL,
    `oldValue` JSON NULL,
    `newValue` JSON NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(512) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_createdAt_idx`(`createdAt`),
    INDEX `AuditLog_userId_idx`(`userId`),
    INDEX `AuditLog_action_idx`(`action`),
    INDEX `AuditLog_entity_idx`(`entity`),
    INDEX `AuditLog_entityId_idx`(`entityId`),

    PRIMARY KEY (`id`),
    CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
