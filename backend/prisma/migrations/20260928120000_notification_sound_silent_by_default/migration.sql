-- Notification alert tones are opt-in.
--
-- Only the column DEFAULT moves: a row that already exists keeps the value it
-- was written with, so anyone who had turned the sound on (or off) keeps their
-- own choice. Accounts created from here on are silent until they pick a sound
-- and switch it on in Settings.
ALTER TABLE `notificationsettings` ALTER COLUMN `soundEnabled` SET DEFAULT false;
