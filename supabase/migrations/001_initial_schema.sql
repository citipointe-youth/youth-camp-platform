-- Youth Camp Platform — initial Supabase schema.
--
-- DESIGN NOTES (see docs/DEPLOYMENT-DESIGN.md):
--  * IDs are TEXT, generated in-app (utils/id.ts: "<prefix>_<hex>"), NOT db uuids.
--    This makes the settings/defaults singletons natural (fixed text ids).
--  * Hybrid mapping (D4): relational child tables for data that is queried/aggregated
--    (check_in_history, sign_out_history, reservations); JSONB for fixed-shape blobs
--    (church.contacts, person.consents, defaults snapshot).
--  * Unified `people` table (D2): one entity for registrants + campers, distinguished
--    by `lifecycle`. A person becomes a "camper" at their Day-1 first check-in
--    (lifecycle 'registered' -> 'arrived'). `kind` is 'youth' | 'leader'.
--  * The Express API connects as the postgres superuser (DATABASE_URL), bypassing
--    RLS. RLS is enabled in 003 as defence-in-depth against a leaked anon key.

create table users (
  id text primary key,
  first_name text not null,
  last_name text not null,
  username text unique not null,   -- login identifier (a username, not an email)
  mobile text,
  role text not null,                 -- church | zoneLeader | director | admin
  church_id text,
  church_name text,
  zone text,
  status text not null default 'active',  -- active | inactive
  password_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table churches (
  id text primary key,
  name text not null,
  zone text not null,
  code text unique not null,
  self_register_slug text unique not null,
  expected_count int not null default 0,
  youth_pastor_name text,
  contact_email text,
  contact_phone text,
  -- Fixed-shape nested blob (JSONB per D4): {male:{primary,backup},female:{...}}.
  contacts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Church-held accommodation reservations — child table (queried for capacity math, B1).
create table reservations (
  id text primary key,
  church_id text not null references churches(id) on delete cascade,
  kind text not null,                 -- tent | classroom
  spots int not null default 0,
  label text not null,
  confirmed boolean not null default false
);
create index reservations_church_idx on reservations(church_id);

create table people (
  id text primary key,
  -- identity
  first_name text not null,
  last_name text not null,
  gender text not null,               -- male | female | other
  date_of_birth date,
  grade int,
  school text,
  kind text not null default 'youth', -- youth | leader (D2)
  -- affiliation
  church_id text references churches(id) on delete set null,
  church_name text not null,
  zone text not null,
  group_id text,
  -- contact + care (ordinary data per D1)
  mobile text,
  email text,
  suburb text,
  postcode text,
  state text,
  medical_conditions text[] not null default '{}',
  dietary_requirements text[] not null default '{}',
  other_medications text,
  parent_guardian_name text,
  parent_phone text,
  parent_relation text,
  blue_card_number text,
  blue_card_expiry date,
  consents jsonb not null default '{}'::jsonb,  -- fixed-shape blob per D4
  -- pre-camp / Hub
  payment_status text not null default 'unpaid', -- unpaid | deposit | paid
  accommodation_kind text,
  accommodation_label text,
  -- lifecycle (D2): registered | arrived | checked_out | departed | cancelled
  lifecycle text not null default 'registered',
  at_camp boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index people_church_idx on people(church_id);
create index people_zone_idx on people(zone);
create index people_lifecycle_idx on people(lifecycle);

-- Per-person check-in history — child table (queried/aggregated for rosters + counts).
create table check_in_history (
  id text primary key,
  person_id text not null references people(id) on delete cascade,
  session_id text not null,
  session_label text not null,
  type text not null,                 -- in | out
  leader_id text not null,
  timestamp timestamptz not null default now()
);
create index check_in_history_person_idx on check_in_history(person_id);
create index check_in_history_session_idx on check_in_history(session_id);

-- Per-person sign-out / sign-in events — child table.
create table sign_out_history (
  id text primary key,
  person_id text not null references people(id) on delete cascade,
  type text not null,                 -- out | in
  leader_name text not null,
  reason text,
  parents_met boolean,
  author_id text not null,
  timestamp timestamptz not null default now()
);
create index sign_out_history_person_idx on sign_out_history(person_id);

create table accommodation_blocks (
  id text primary key,
  kind text not null,                 -- tent | classroom
  name text not null,
  price numeric not null default 0,
  capacity int not null default 0,
  base_taken int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table zones (
  id text primary key,
  name text not null,
  color text
);

create table groups (
  id text primary key,
  name text not null,
  church_id text,
  zone text,
  leader_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table notes (
  id text primary key,
  camper_id text not null,
  body text not null,
  author_id text not null,
  author_name text not null,
  author_church_id text,
  session_id text,
  category text,
  created_at timestamptz not null default now()
);
create index notes_camper_idx on notes(camper_id);

create table notifications (
  id text primary key,
  scope text not null,                -- camp | zone | church
  zone text,
  church_id text,
  priority text not null default 'normal',  -- normal | urgent
  title text not null,
  body text not null,
  sender_id text,
  sender_name text,
  sender_role text,
  audience_estimate int,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_created_idx on notifications(created_at desc);

create table schedule_items (
  id text primary key,
  day text not null,
  start_time text not null,
  end_time text,
  title text not null,
  location text,
  type text not null,                 -- meal | session | activity | free | logistics
  is_check_in_point boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table devotionals (
  id text primary key,
  day text not null,
  verse text not null,
  reference text not null,
  reflection text not null,
  prayer text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table faqs (
  id text primary key,
  question text not null,
  answer text not null,
  "order" int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Singletons: fixed text PKs ('settings' / 'defaults') guarantee one row even under
-- concurrent cold-start upserts (no gen_random_uuid() that would never conflict).
create table settings (
  id text primary key default 'settings',
  camp_name text not null default 'Youth Camp',
  year int not null,
  start_date text not null,
  end_date text not null,
  timezone text not null default 'Australia/Brisbane',
  check_in_location text not null default '',
  check_in_from text not null default '',
  check_in_banner text,
  register_base_url text not null default '',
  check_in_days text[] not null default '{}',
  accommodation_locked boolean not null default false,
  camp_mode text not null default 'pre-camp',  -- pre-camp | at-camp
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settings_singleton check (id = 'settings')
);

create table defaults (
  id text primary key default 'defaults',
  snapshot jsonb not null,            -- CampDefaults blob (churches/users/.../devotionals)
  created_at timestamptz not null default now(),
  constraint defaults_singleton check (id = 'defaults')
);
