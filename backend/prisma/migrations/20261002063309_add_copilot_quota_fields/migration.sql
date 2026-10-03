-- AlterTable
ALTER TABLE `admincopilotexchange` ADD COLUMN `quotaExhausted` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `retryAfterMs` INTEGER NULL;
