-- Widen long-form text columns.
--
-- A bare `String` in the Prisma schema maps to VARCHAR(191) on MySQL, which
-- silently truncated every one of these fields mid-sentence. AIMessage.content
-- in particular cut model replies off at 191 characters, and because the
-- truncated text was replayed as chat history the model then believed its own
-- earlier answers had been cut off. The Zod validators already permitted far
-- more than 191 characters, so the database was the only real limit.
--
-- TEXT holds 65,535 bytes, comfortably above any single AI reply, chat message,
-- note or notification while leaving normal query performance untouched.
ALTER TABLE `AIMessage` MODIFY `content` TEXT NOT NULL;
ALTER TABLE `Message` MODIFY `content` TEXT NULL;
ALTER TABLE `Note` MODIFY `content` TEXT NOT NULL;
ALTER TABLE `Notification` MODIFY `message` TEXT NOT NULL;
