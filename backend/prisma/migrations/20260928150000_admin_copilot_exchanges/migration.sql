-- Admin copilot history: a durable record of every question an admin asked and
-- the answer that came back.
--
-- This is a new table, so it is purely additive — no existing row is read,
-- written or re-interpreted, and the copilot works exactly as before on an
-- empty table.
--
-- The point of the table is durability. `ask` now writes the question, hands
-- the provider call to a BullMQ job and returns 202, so an answer can land
-- while the admin is on another page or has closed the tab. That is only
-- possible if the answer is written somewhere that outlives the browser, which
-- is what this table is. Nothing here is a cache: rows are the history the
-- console re-reads on load.

-- CreateTable
CREATE TABLE `AdminCopilotExchange` (
    `id` VARCHAR(191) NOT NULL,
    `adminId` VARCHAR(191) NOT NULL,
    `question` TEXT NOT NULL,
    `answer` TEXT NULL,
    `status` ENUM('PENDING','ANSWERED','FAILED') NOT NULL DEFAULT 'PENDING',
    `error` VARCHAR(191) NULL,
    `provider` VARCHAR(191) NULL,
    `jobId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `answeredAt` DATETIME(3) NULL,

    INDEX `AdminCopilotExchange_adminId_createdAt_idx`(`adminId`, `createdAt`),
    INDEX `AdminCopilotExchange_status_idx`(`status`),

    PRIMARY KEY (`id`),
    CONSTRAINT `AdminCopilotExchange_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
