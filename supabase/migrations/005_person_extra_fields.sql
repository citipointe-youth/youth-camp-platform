-- Adds the Person fields needed for full Elvanto round-trip fidelity:
--   medicare_number       — the Medicare Number column
--   church_unlisted_note  — the "if church not listed, specify name & Youth Pastor" column
--   elvanto_meta          — verbatim submission-metadata columns (Date Submitted,
--                           Submission Status, raw Person cell, Person Status, Today's Date)
--                           kept so an export reproduces the source CSV byte-for-byte.
--
-- APPLIED 2026-06-22 to the production project (nwfafrgojqkxylbppywo). Originally
-- authored for parity and left unapplied; the live CSV import then failed with
-- "column medicare_number of relation people does not exist" because the repo
-- (supabase.people.ts) writes these 3 columns. Applying this migration fixed it.
alter table if exists people
  add column if not exists medicare_number text,
  add column if not exists church_unlisted_note text,
  add column if not exists elvanto_meta jsonb;
