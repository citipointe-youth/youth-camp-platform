-- 014: Account login locks (manual admin toggles in Settings).
--
-- Two booleans on the settings singleton. When true, accounts of that role are blocked
-- at LOGIN only (auth.service) — existing signed sessions keep working until their token
-- TTL. admin / director / firstAid are never affected. Both default false.
--
-- Backward-compatible & idempotent: existing settings row gets false for both columns.
-- Safe to apply before or with the deploy (the SPA/back end tolerate the columns being
-- absent on read via a `?? false` fallback, but writes require them — apply before deploy).
alter table settings add column if not exists church_login_locked boolean not null default false;
alter table settings add column if not exists zone_leader_login_locked boolean not null default false;
