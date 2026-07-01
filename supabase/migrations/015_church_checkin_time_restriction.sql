-- 015: Church check-in time restriction (manual admin toggle in Settings).
--
-- When true, church accounts (only) may only submit a daily check-in for the CURRENT
-- session by real clock time (not other days/sessions). zoneLeader/director/admin are
-- never restricted. Default false.
--
-- Backward-compatible & idempotent: existing settings row gets false.
alter table settings add column if not exists church_checkin_time_restricted boolean not null default false;
