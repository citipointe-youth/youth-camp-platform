# Security Actions — First Deploy Checklist

Complete these steps IN ORDER before telling anyone the app URL.

## 1. Set SESSION_SECRET
In Vercel Environment Variables, set SESSION_SECRET to 64+ random hex chars.
Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
Without this, anyone can forge auth tokens.

## 2. Lock CORS
Set CORS_ORIGINS to your exact Vercel URL (e.g. `https://youth-camp-platform.vercel.app`).
Never leave this as `*` in production.

## 3. Set the admin password
After first deploy, visit https://<your-url>/setup
Enter your chosen admin username and password.
This endpoint is permanently disabled once any password is set.

## 4. Confirm RLS is active
In Supabase → SQL Editor, run:
  SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
All tables should show rowsecurity = true.

Test that the anon key cannot read data:
  curl https://<supabase-url>/rest/v1/users -H "apikey: <anon-key>"
Expected: 401 or empty result (not user rows).

## 5. Verify migrations applied
In Supabase → Table Editor, confirm these tables exist:
  users, churches, people, check_in_history, sign_out_history,
  reservations, accommodation_blocks, zones, groups, notes,
  notifications, schedule_items, devotionals, faqs, settings, defaults

## 6. After new-year rollover
After running POST /admin/new-year, restored church/zone accounts have no password.
Go to Admin → Accounts and set a new password for each church/zone account before
telling leaders to log in.
