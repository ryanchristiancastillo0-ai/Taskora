-- AlterTable
ALTER TABLE `AdminCopilotExchange` ADD COLUMN `quotaExhausted` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `retryAfterMs` INTEGER NULL;
