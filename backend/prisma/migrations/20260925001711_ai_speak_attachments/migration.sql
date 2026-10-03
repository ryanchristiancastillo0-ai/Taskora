-- AlterTable
ALTER TABLE `aiconversation` ADD COLUMN `isSpeak` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `aimessage` ADD COLUMN `attachments` JSON NULL;
