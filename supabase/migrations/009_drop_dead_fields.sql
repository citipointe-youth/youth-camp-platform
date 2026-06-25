-- Part 2 of removing dead fields. Drops the now-unused columns. APPLY AFTER the new
-- application code (which no longer reads/writes these columns) is live in production.
-- Safe to run more than once (IF EXISTS).

alter table churches
  drop column if exists code,
  drop column if exists self_register_slug,
  drop column if exists expected_count,
  drop column if exists youth_pastor_name,
  drop column if exists contact_email;

alter table settings
  drop column if exists check_in_location,
  drop column if exists check_in_from,
  drop column if exists register_base_url;

alter table schedule_items
  drop column if exists is_check_in_point;
