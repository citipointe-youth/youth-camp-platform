-- Part 1 of removing dead church fields (registration code, self-register slug,
-- expected count, youth pastor, contact email) + dead settings fields (check-in
-- location/from, register base URL) + schedule is_check_in_point.
--
-- This part only RELAXES constraints so the new application code — which no longer
-- writes `code`/`self_register_slug` — can insert/update churches without violating
-- NOT NULL, while the currently-deployed code still works. APPLY BEFORE DEPLOYING the
-- new code. The columns themselves are dropped in migration 009 AFTER the deploy.

alter table churches alter column code drop not null;
alter table churches alter column self_register_slug drop not null;
alter table churches drop constraint if exists churches_code_key;
alter table churches drop constraint if exists churches_self_register_slug_key;
