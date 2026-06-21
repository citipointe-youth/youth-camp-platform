-- Adds the Person fields needed for full Elvanto round-trip fidelity:
--   medicare_number       — the Medicare Number column
--   church_unlisted_note  — the "if church not listed, specify name & Youth Pastor" column
--   elvanto_meta          — verbatim submission-metadata columns (Date Submitted,
--                           Submission Status, raw Person cell, Person Status, Today's Date)
--                           kept so an export reproduces the source CSV byte-for-byte.
--
-- NOTE: the Supabase repo layer is unverified scaffolding (see
-- src/repositories/supabase/README.md, KNOWN RISK R11); this migration is provided for
-- parity and is NOT applied as part of this change.
alter table if exists people
  add column if not exists medicare_number text,
  add column if not exists church_unlisted_note text,
  add column if not exists elvanto_meta jsonb;
