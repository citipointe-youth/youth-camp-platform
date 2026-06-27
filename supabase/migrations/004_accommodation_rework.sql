-- 004: Accommodation rework — replace blocks + per-church reservations with
-- classroom rooms + allocation rows; move tent/classroom prices onto settings.
--
-- DESTRUCTIVE: drops accommodation_blocks and reservations. Take an audit export
-- (wipe-guard convention) before applying to production.

drop table if exists reservations;
drop table if exists accommodation_blocks;

create table classrooms (
  id text primary key,
  name text not null,
  capacity int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table classroom_allocations (
  id text primary key,
  room_id text not null references classrooms(id) on delete cascade,
  church_id text not null,
  gender text not null,            -- male | female
  n int not null default 0
);
create index classroom_allocations_room_idx on classroom_allocations(room_id);
create index classroom_allocations_church_idx on classroom_allocations(church_id);

alter table settings add column if not exists tent_price numeric not null default 0;
alter table settings add column if not exists classroom_price numeric not null default 0;

-- Defence-in-depth: match 003 (RLS on, no anon policies; the superuser API bypasses).
alter table classrooms            enable row level security;
alter table classroom_allocations enable row level security;
