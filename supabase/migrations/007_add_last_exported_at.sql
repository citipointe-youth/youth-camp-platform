-- Sprint 5: wipe guard requires this timestamp to be set before new-year/reset.
-- Rollback: ALTER TABLE settings DROP COLUMN IF EXISTS last_exported_at;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS last_exported_at timestamptz;
