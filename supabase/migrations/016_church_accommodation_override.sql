-- 016: Church accommodation override.
--
-- When set ('tent' | 'classroom'), every STUDENT of the church has their
-- accommodationKind forced to this value at CSV import time — corrects wrong
-- ticket-type purchases. Leaders are never overridden. Null = no override
-- (churches that deliberately split ticket types leave it unset).
--
-- Backward-compatible & idempotent.
alter table churches add column if not exists accommodation_override text null
  check (accommodation_override in ('tent', 'classroom') or accommodation_override is null);
