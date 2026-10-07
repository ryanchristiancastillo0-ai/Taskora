-- AlterTable
ALTER TABLE `AIConversation` ADD COLUMN `isSpeak` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `AIMessage` ADD COLUMN `attachments` JSON NULL;
