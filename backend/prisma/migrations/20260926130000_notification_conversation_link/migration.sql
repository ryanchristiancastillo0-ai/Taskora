-- Link chat notifications back to the conversation that produced them, so the
-- client can offer a "View chat" deep link from the notification feed.
-- AlterTable
ALTER TABLE `Notification` ADD COLUMN `conversationId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Notification_conversationId_idx` ON `Notification`(`conversationId`);

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
