-- Enable Row-Level Security on all tables (defence-in-depth).
--
-- The Express API connects via the postgres superuser (DATABASE_URL), which
-- BYPASSES RLS — so the app keeps working with no policies defined. With RLS on
-- and no anon policies, any connection using the Supabase anon key (PostgREST /
-- client SDK) is denied all rows, protecting the data if the anon key ever leaks.

alter table users               enable row level security;
alter table churches            enable row level security;
alter table reservations        enable row level security;
alter table people              enable row level security;
alter table check_in_history    enable row level security;
alter table sign_out_history    enable row level security;
alter table accommodation_blocks enable row level security;
alter table zones               enable row level security;
alter table groups              enable row level security;
alter table notes               enable row level security;
alter table notifications       enable row level security;
alter table schedule_items      enable row level security;
alter table devotionals         enable row level security;
alter table faqs                enable row level security;
alter table settings            enable row level security;
alter table defaults            enable row level security;
