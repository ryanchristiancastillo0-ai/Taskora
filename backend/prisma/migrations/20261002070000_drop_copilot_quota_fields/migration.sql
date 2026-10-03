-- Reverts 20261002063309_add_copilot_quota_fields.
--
-- The quota state is carried in the existing `error` column behind a
-- machine-readable prefix instead, so a FAILED copilot row can say "this was a
-- request limit, it clears in Ns" without adding columns. Adding them meant the
-- generated Prisma client had to be regenerated before the service would stop
-- throwing on unknown arguments, and regeneration is blocked while the dev
-- server holds the query engine — an avoidable footgun for no real gain.
ALTER TABLE `admincopilotexchange` DROP COLUMN `quotaExhausted`,
    DROP COLUMN `retryAfterMs`;