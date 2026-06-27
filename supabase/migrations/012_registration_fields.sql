-- Add registration type, cost, and discount code columns to people table.
alter table people
  add column if not exists registration_type text,
  add column if not exists registration_cost numeric,
  add column if not exists discount_code text;
