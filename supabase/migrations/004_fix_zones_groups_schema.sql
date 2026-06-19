-- Zone entity has label, colorHex, leaderIds, createdAt, updatedAt fields
-- that were missing from the initial schema. Migrate the old `color` column
-- to `color_hex` and add the remaining fields.
alter table zones
  add column label       text        not null default '',
  add column color_hex   text        not null default '#000000',
  add column leader_ids  text[]      not null default '{}',
  add column created_at  timestamptz not null default now(),
  add column updated_at  timestamptz not null default now();

-- Migrate any existing color data to color_hex, then drop the old column.
update zones set color_hex = color where color is not null;
alter table zones drop column color;

-- Group entity has camperIds (required) missing from the initial schema.
alter table groups
  add column camper_ids text[] not null default '{}';
