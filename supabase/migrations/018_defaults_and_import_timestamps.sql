-- 018: "Save Defaults" timestamp + per-source import timestamps on the settings singleton.
--
-- Four nullable timestamptz columns:
--   defaults_saved_at    — set by admin.service saveDefaults; shown on the Data screen's
--                          Save Defaults card and the close-out checklist (bugs 6 & 10).
--   form_imported_at     — set on a successful (non-dry-run) Form import.
--   tickets_imported_at  — set on a successful (non-dry-run) Ticket List import.
--   invoices_imported_at — set on a successful (non-dry-run) Invoice import.
--     (the last three drive the "last upload" indicator on the redesigned import screen.)
--
-- All nullable (null = never done). Idempotent & backward-compatible: reads tolerate absence
-- via `?? null`, but supabase.settings writes ALL settings columns on every save, so this
-- MUST be applied before/with the deploy or every settings save would fail.
alter table settings add column if not exists defaults_saved_at    timestamptz;
alter table settings add column if not exists form_imported_at     timestamptz;
alter table settings add column if not exists tickets_imported_at  timestamptz;
alter table settings add column if not exists invoices_imported_at timestamptz;
