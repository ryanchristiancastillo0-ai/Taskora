-- Admin Panel support: an account role and an administratively-settable status.
--
-- Both columns are added with a NOT NULL DEFAULT, so this is additive: every
-- existing row lands on USER/ACTIVE, which is exactly the access level it had
-- before the admin console existed. No backfill and no data rewrite.
--
-- The status column is separate from "is this person still around". The admin
-- dashboard derives that from RefreshToken.lastUsedAt and it stays derived —
-- suspension is the only one of the two an admin can actually set.

-- AlterTable
ALTER TABLE `User`
  ADD COLUMN `role` ENUM('USER','ADMIN') NOT NULL DEFAULT 'USER',
  ADD COLUMN `status` ENUM('ACTIVE','SUSPENDED') NOT NULL DEFAULT 'ACTIVE';

-- The console filters and sorts on both columns across the whole table, so they
-- are indexed rather than left to a full scan.
CREATE INDEX `User_role_idx` ON `User`(`role`);
CREATE INDEX `User_status_idx` ON `User`(`status`);
