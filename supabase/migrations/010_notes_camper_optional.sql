-- Allow "general" testimonies that aren't tied to a specific student. A testimony is
-- a note with category='testimony'; making camper_id nullable lets a leader log a
-- camp-wide testimony with no student selected. Backward-compatible (existing code
-- always supplied a camper_id), so safe to apply before or with the deploy.
alter table notes alter column camper_id drop not null;
