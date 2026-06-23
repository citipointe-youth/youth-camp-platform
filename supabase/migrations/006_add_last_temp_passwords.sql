-- Sprint 4: stores temp passwords generated during new-year rollover.
-- Cleared from settings after the close-out export is downloaded.
-- Rollback: ALTER TABLE settings DROP COLUMN IF EXISTS last_temp_passwords;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS last_temp_passwords jsonb;
