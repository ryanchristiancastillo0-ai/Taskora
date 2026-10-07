-- AlterTable
ALTER TABLE `Note` ADD COLUMN `pinned` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `pinnedAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `Note_userId_pinned_idx` ON `Note`(`userId`, `pinned`);
