-- Seed the single admin account + the settings singleton so the app is usable
-- immediately after the schema is applied (production runs PERSISTENCE=supabase,
-- which does NOT run the in-app demo seed — that only runs for PERSISTENCE=memory).
--
-- IMPORTANT: the password_hash below is a PLACEHOLDER. Set a real password after
-- deploy via Admin -> Accounts (or replace this hash). The app uses scrypt hashes
-- of the form "salt:derivedKey" (utils/crypto.ts). Leaving it null forces an
-- operator to set one before first login (login rejects a null hash).

insert into users (id, first_name, last_name, username, role, status, password_hash, created_at, updated_at)
values (
  'user_seed_admin',
  'Platform', 'Admin',
  'admin',
  'admin',
  'active',
  null,                              -- set a real scrypt hash before first login
  now(), now()
)
on conflict (id) do nothing;

insert into settings (id, camp_name, year, start_date, end_date, timezone, camp_mode, created_at, updated_at)
values (
  'settings',
  'Youth Camp',
  extract(year from now())::int,
  '',
  '',
  'Australia/Brisbane',
  'pre-camp',
  now(), now()
)
on conflict (id) do nothing;
