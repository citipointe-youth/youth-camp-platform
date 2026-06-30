# PHASE 6 — Year-to-Year Reusability Review

> **Question for every feature:** *can a non-technical operator reuse this for next year's camp
> through the UI alone — no code, no schema, no backend changes?*
>
> **Operator persona:** the camp admin. Cannot code, cannot open the database, cannot edit `seed.ts`
> or redeploy. Has the single `admin` login and a web browser. Their tools are the Admin console
> screens, the CSV import, and the Close-Out / Save-Defaults / Reset buttons.
>
> **Posture (owner decision):** fix clear low-risk gaps in place; specify larger "make this an
> admin-managed feature" gaps for the owner rather than building them silently.
>
> **Owner decisions (2026-06-30) — now resolved, no longer open:**
> - **Z1 (zones):** keep the four zones (Yellow/Blue/Black/Red) **fixed** — documented as a platform
>   constraint, no code change.
> - **T1 (timezone):** camp is **always Australia/Brisbane** — fixed by design, no in-app field. (The
>   timezone "clobber fix" considered in the first draft was reverted: with Brisbane an intentional
>   invariant, re-asserting it on every save is correct and self-healing.)
> - **S1 (Save Defaults dependency):** **build a nudge now** (done — see "Fixed here").
> - **Scope:** implement the low-risk fix (S1) this session; Z1/T1 close as documented constraints.
>
> **Verification:** reasoning + `node --check` on the SPA `<script>` (PARSE OK, backticks even = 598).
> No `.ts` changed → `tsc`/vitest unaffected (gated in DEPLOY-CHECKLIST §0). Nothing pushed/deployed.

---

## How year-specific data flows today (the mental model)

There are **three** places year/config data lives, and only the first two are reachable by the
operator:

1. **`CampSettings` singleton + the scaffold tables** (churches, accounts, classrooms, FAQ, schedule,
   devotionals, ministry contacts) — all **editable in-app** via the Admin console. This is the
   reusable configuration.
2. **The per-camper data** — arrives **only** via CSV import (`POST /import/csv`). Self-registration
   was removed (2026-06-25); every camper, their **cost**, their **discount code**, their
   **accommodation kind**, and their consents come from columns in the uploaded Elvanto CSV. So
   "next year's campers + their fees" is a pure re-import, no config.
3. **`src/data/seed.ts`** — hardcoded demo churches/accounts/dates/rooms/schedule. This runs **only
   on a fresh empty DB** (idempotent: returns early if any user exists). It is **not** the
   year-to-year path — but it *is* the fallback identity after a Factory Reset if Save Defaults was
   never run. The operator cannot edit it.

The rollover machinery (`src/services/admin.service.ts`):

- **`saveDefaults`** — snapshots the scaffold (churches, accounts *minus password hashes*, classrooms,
  FAQ, schedule, devotionals) as the reusable baseline.
- **`newYear`** (the routine annual rollover, behind the guided Close-Out flow) — purges people +
  notes + notifications + **allocations**, **restores** the scaffold from the snapshot, bumps the
  year, forces pre-camp, and re-issues **temp passwords** for restored accounts.
- **`reset`** — full wipe to bare; keeps only the admin + camp settings; **no** restore.

This is a genuinely well-designed reuse model. The classrooms (scaffold) survive a rollover; the
**allocations** (per-cohort) are correctly wiped — and the new `bracket` column (migration 013) is on
the allocation rows, so it is wiped with them and **cannot leak stale data across a year** (verified:
`newYear` calls `allocationRepo.deleteAll()`).

---

## Feature-by-feature reusability table

| Feature | Year-to-year need | Reusable w/o code? | What the non-coder does | Gap & recommendation | Status |
|---|---|---|---|---|---|
| **Camp name** | Rename per year (optional) | **Yes** | Admin → Camp settings → Camp name → Save | — | OK |
| **Year** | Bump each year | **Yes** | Auto-bumped by Close-Out rollover (`SETTINGS.year+1`); also editable on Camp settings | — | OK |
| **Camp dates (start/end)** | Change every year | **Yes** | Admin → Camp settings → Start/End date. Start pre-fills end to day-4; check-in days auto-generate | — | OK |
| **Check-in days / sessions** | Follow the dates | **Yes** | Auto-derived from the date range (one AM + one PM per day; first day PM-only, last day AM-only) — no manual step | — | OK |
| **Timezone** | Rare (only a new locale) | **Yes (fixed)** | Nothing — camp is always `Australia/Brisbane` (owner decision); re-asserted on every settings save | **T1 RESOLVED:** fixed by design. No in-app field; one line for a developer to change if the camp ever relocates timezone. Drives compliance-export timestamps | OK (closed) |
| **Churches** | Add/remove/rename yearly | **Yes** | Admin → Accounts & churches → add/rename/zone/delete; or bulk via church CSV import. Survives rollover | — | OK |
| **Zones** | Fixed (owner decision) | **Yes (fixed)** | Pick from the fixed dropdown (Yellow/Blue/Black/Red) | **Z1 RESOLVED:** zones are a deliberate fixed set (`ZONE_NAMES`, Zod-validated + DB rows). Documented as a platform constraint — not admin-managed. The stale-list bug (Green vs Black) was fixed here | OK (closed) |
| **Accounts (leaders/director/first-aid/church logins)** | Recreated/restored yearly | **Yes** | Admin → Accounts & churches. Restored by rollover (password-less → temp passwords) | Minor: restored accounts need passwords set — temp passwords surfaced + retained for export (R9, resolved) | OK |
| **Registration categories & costs** | Change every year | **Yes** | **Via the CSV `Cost` column** — Budget reads per-registrant `registrationCost`, not settings. New fees = new CSV | No in-app "set the camp fee" — by design (fees come from the registration system). Documented | OK |
| **Discount / sponsorship codes** | Change every year | **Yes** | **Via the CSV `Code` column** — surfaced per-church in Budget. No separate code registry to maintain | No in-app discount-code admin — codes are descriptive (carried from the CSV), not validated/redeemed. Acceptable for this app's role | OK |
| **Accommodation — classroom rooms** | Reuse/adjust yearly | **Yes** | Admin → Accommodation → add/rename/capacity/delete. Survives rollover (scaffold) | — | OK |
| **Accommodation — allocations** | Re-done each cohort | **Yes** | Correctly **wiped** on rollover (per-cohort); operator re-allocates after import. `bracket` column wiped with them (no stale leak) | — | OK |
| **Accommodation — tents** | Auto | **Yes** | Nothing — auto-bucketed (7/tent, students & leaders separate), display-only | — | OK |
| **Accommodation kind (tent vs classroom)** | Per camper | **Yes** | From the CSV `Type` column (`Classroom`/`Tent`) | — | OK |
| **Ministry contacts (leader phone numbers)** | Update yearly | **Yes** | Admin → Ministry contacts → per church, guys/girls primary+secondary. Part of the scaffold snapshot | — | OK |
| **FAQ** | Edit yearly | **Yes** | Admin → FAQ (add/edit/delete). In the scaffold snapshot | — | OK |
| **Schedule** | Rebuild yearly | **Yes** | Admin → Schedule (per day, time+activity rows). Keyed to the new dates. In the snapshot | Note: snapshot restores *last year's* schedule items, which carry last year's dates — operator overwrites them per day. Works, but is "edit over the old", not "blank" | OK |
| **Devotionals** | Rewrite yearly | **Yes** | Admin → Devotionals (per camp day). In the snapshot | Same date-carryover note as Schedule | OK |
| **First-aid records** | Wiped yearly | **Yes** | Purged with people/notes on rollover; exported in the audit workbook first | — | OK |
| **Import (campers)** | Every year | **Yes** | Admin → Data → Upload CSV. Matches by name; auto-creates unlisted churches (zone defaults Yellow); CSV is authoritative (absent rows deleted) | Minor: phantom-church zone defaults to Yellow — operator should pre-create churches or fix zone after. Dry-run + warnings exist | OK |
| **Export (prior year)** | Every year before wipe | **Yes** | Admin → Data → Compliance Export (audit `.xlsx` + sign-in/out `.csv`); also the Elvanto-format registrants CSV on the Data screen. Close-Out gates rollover on having exported | — | OK |
| **Budget** | Recomputed each year | **Yes** | Auto from per-registrant cost after import; client CSV export | — | OK |
| **Camp mode (pre/at-camp)** | Reset to pre-camp yearly | **Yes** | Rollover forces pre-camp; admin can switch any time | — | OK |
| **Save Defaults baseline** | Run once per setup | **Yes** | Admin → Data → Save Defaults. **Required** before the first New Year | **S1 FIXED here:** Close-Out now reminds you to run Save Defaults first; if you skip it, the rollover stops with an actionable modal that routes to the Data screen (nothing is purged) | OK (fixed) |
| **Factory reset** | Rare | **Yes** | Admin → Data → Full reset (typed confirmation). Falls back to `seed.ts` identity on next empty boot | `seed.ts` content (demo churches/dates) is the post-reset fallback and is not operator-editable — acceptable; reset is a rare "start completely over" | OK |

**Tally (after the owner's decisions + this session's fixes):** every functional area is now **Yes**
for year-to-year reuse through the UI. Timezone and Zones are **Yes (fixed by design)** — deliberate
single-value constraints, not gaps; Save Defaults is **Yes (fixed)** — the rollover now guards itself.
The only remaining "needs a developer" cases are the two deliberate constraints (a timezone relocation
or a new zone name), both one-line code changes the owner has chosen to keep in code. Nothing blocks
the common-case yearly reuse.

---

## Fixed here (this phase)

1. **Stale SPA zone list (correctness + reuse).** `public/index.html` `ZONES` was
   `['Yellow','Blue','Green','Red']` — left over from before **migration 011** renamed the *Green*
   zone to *Black*. The director's **"send a zone notice"** composer is the sole consumer of `ZONES`,
   so a director could not target the live **Black** zone, and choosing **Green** posted a notice **no
   church or leader could receive** (no records carry zone "Green" after 011). Fixed to
   `['Yellow','Blue','Black','Red']`, matching backend `ZONE_NAMES` and the accounts screen's
   `ZONE_OPTS`. Also collapsed the duplicate `ZONE_OPTS` to **reference the single `ZONES`** constant
   so the two can't silently drift apart again. SW cache bumped `camp-v6 → camp-v7`.

2. **S1 — New Year now guards against a missing baseline (reusability).** `newYear` throws "No
   defaults snapshot saved…" if Save Defaults was never run — previously surfaced only as a bare toast
   buried in the Close-Out flow. Now: (a) the Close-Out checklist opens with a plain-English reminder
   to run Save Defaults first, and (b) if the rollover is attempted without a snapshot, the error is
   caught and shown as an **actionable modal** that routes straight to the Data screen — mirroring the
   existing "export required" modal in `adminReset`. **Nothing is purged on this path** (the snapshot
   check runs before any delete). SPA-only; no backend change.

---

## Resolved by owner decision (no longer open)

- **Z1 — Zones are a fixed set, by design.** `ZONE_NAMES = ['Yellow','Blue','Black','Red']`
  (`src/core/types/enums.ts`) is the single source: the account Zod schemas validate against it, the
  SPA dropdowns list it, and DB rows store these strings. **Owner decision: keep the four zones fixed**
  and document it as a platform constraint. A camp wanting different/additional zones would need a
  developer (edit the enum + a data migration like 011) — this is accepted, not a gap to close. (For
  the record, the admin-managed alternative would be a `zones` table + schema relaxation + CRUD screen
  + migration — deliberately *not* built.)

- **T1 — Timezone is fixed at `Australia/Brisbane`, by design.** **Owner decision: the camp is always
  Brisbane-time.** `saveSettings()` re-asserts `timezone:'Australia/Brisbane'` on every save (correct
  and self-healing under this invariant); there is intentionally no in-app field. If the camp ever
  relocates timezones, it's a one-line developer change (documented at that line). *(The draft "clobber
  fix" that preserved a stored value was reverted — it only made sense if timezone were meant to vary,
  which the owner has ruled out.)*

- **`seed.ts` as the post-reset fallback.** After a Factory Reset on an empty DB, the next boot
  re-seeds the **demo** churches/accounts/dates/rooms. This is correct for first-run, but means a
  reset doesn't drop the operator onto *their* config — it drops them onto the demo. Not changed (reset
  is the rare "start over from scratch" path, and the snapshot/rollover path is the intended yearly
  loop). Documented so it isn't mistaken for a bug.

---

## "New Camp Year" runbook (plain English, for the admin)

Do these **in order**, in the Admin console. Steps that still need a developer are flagged 🛠.

**A. While last year's camp is still loaded — capture it (compliance):**

1. **Admin → Data, Reset & Exports → Compliance Export.** Download the **audit workbook (.xlsx)**
   and the **sign-in/out log (.csv)**. Save both somewhere safe. *(This is required — the rollover is
   blocked until an export has been run.)*
2. If you want the registration list too: **Admin → (Data screen) → Export all** (Elvanto-format CSV).

**B. Make sure your setup is saved as the reusable baseline:**

3. **Admin → Data → Save Defaults.** This snapshots your churches, accounts, accommodation rooms,
   FAQ, schedule, devotionals and ministry contacts. *(If you set everything up this year and never
   pressed this, press it now — otherwise the rollover in step 4 will stop and send you back here.
   The Close-Out screen reminds you of this, and the rollover won't purge anything if the baseline is
   missing.)*

**C. Roll over to the new year (purge people, keep your setup):**

4. **Admin → Data → Close-out camp → Start close-out.** Tick the three confirmations (download the
   workbook, confirm it's saved, acknowledge it can't be undone), then **Roll over to new year**.
   - This deletes last year's campers, notes, notifications and accommodation allocations.
   - It restores your churches, accounts, rooms, FAQ, schedule and devotionals.
   - It bumps the year and switches the app to **pre-camp**.
   - It shows **temporary passwords** for every restored leader/church login. **Copy them now** and
     share each with its owner securely. *(They're also kept in your next compliance export's "Temp
     Passwords" tab, included once then cleared.)* Each person logs in with their temp password and
     sets their own.

**D. Update this year's configuration (all in-app):**

5. **Admin → Camp settings:** set the new **start/end dates** (check-in days regenerate
   automatically), confirm the **camp name** and **year**.
   - 🛠 *Timezone is fixed at Australia/Brisbane by design — if the camp ever relocates timezones, a
     developer changes one line. (Not a per-year task.)*
6. **Admin → Accounts & churches:** add/rename/remove churches and leadership accounts for this year.
   - 🛠 *Zones are the fixed set Yellow/Blue/Black/Red by design — a different/extra zone needs a
     developer. (Not a per-year task.)*
7. **Admin → Accommodation:** adjust classroom rooms/capacities if they changed.
8. **Admin → Ministry contacts:** update each church's leader phone numbers.
9. **Admin → FAQ / Devotionals / Schedule:** edit over last year's content (the dates now reflect
   this year's camp days).

**E. Bring in this year's campers:**

10. **Admin → Data → Upload students (CSV).** This is the authoritative list: new campers are added,
    matched ones updated, and anyone not in the file is removed. Each camper's **fee** (CSV `Cost`
    column), **discount code** (`Code`), and **tent/classroom** (`Type`) come straight from the file —
    there is nothing else to set for costs.
    - Tip: pre-create any new churches in step 6 first, so the importer matches by name instead of
      auto-creating them with a default Yellow zone.
11. **After import:** re-do **accommodation allocations** (last year's were wiped on purpose), and
    check **Budget** reflects the new fees.

**F. Go live:**

12. When camp starts, **Admin → Switch to At-Camp**.

> The only things that ever need a developer are the two **deliberate fixed constraints** — relocating
> the **timezone** or adding a **non-standard zone** — and neither is a per-year task. Everything in
> the yearly loop is in-app.

---

## Prioritised gap list

All findings are now **resolved** — fixed in code or closed as a deliberate constraint by owner
decision. Nothing remains open.

| # | Item | Outcome | Detail |
|---|---|---|---|
| **1** | Stale `ZONES` (Green vs Black) broke director zone notices | **Fixed** | Corrected to `['Yellow','Blue','Black','Red']` + de-duplicated the two SPA lists (`ZONE_OPTS`→`ZONES`). Was a live prod defect |
| **2** | **S1** — New Year needs a prior Save Defaults | **Fixed** | Close-Out reminder + actionable "Save your setup first" modal that routes to the Data screen; no data purged on that path |
| **3** | **T1** — Timezone not editable in-app | **Closed (by design)** | Owner: camp is always Australia/Brisbane; one-line developer change if it ever relocates. Draft clobber-fix reverted |
| **4** | **Z1** — Zones are a fixed code+enum set | **Closed (by design)** | Owner: keep the four zones fixed; documented as a platform constraint. Admin-managed zones deliberately not built |
| **5** | Import phantom-church zone defaults to Yellow | **Closed (no change)** | Has dry-run + warnings; operator pre-creates churches. Acceptable |
| **6** | `seed.ts` demo data is the post-Factory-Reset fallback, not operator-editable | **Closed (no change)** | Documented; reset is a rare "start over" path |

---

## Handoff note → Phase 7 (redeployment)

- **Files touched this phase (must be in the deploy):**
  - `public/index.html` — `ZONES` corrected to `['Yellow','Blue','Black','Red']`; `ZONE_OPTS` now
    references `ZONES`; `doNewYear()` catch shows an actionable "Save your setup first" modal on the
    no-snapshot error; Close-Out checklist gained a Save-Defaults reminder line. (`saveSettings()`
    timezone is **unchanged** — the draft edit was reverted per the owner's "always Brisbane" decision.)
  - `public/sw.js` — cache bumped `camp-v6 → camp-v7` (so the corrected SPA actually ships; without
    this the old shell would be served from cache).
  - `CHANGELOG.txt`, `docs/PHASE-6-REUSABILITY-REVIEW.md` (this file), `docs/PROGRAM-LOG.md`.
- **No `.ts`, no schema, no migration changes** this phase. Next free migration number remains **014**.
  Confirm migration **013** (allocation `bracket`, from Phase 5) is in the deploy plan — it is inert
  until applied.
- **On-device eyeball for the deploy gate (carry Phase-5 list forward, plus):** (1) as a **director**,
  open the notice composer and confirm the zone dropdown now lists **Black** (not Green) and that a
  Black-zone notice reaches Black-zone churches; (2) as **admin**, attempt a New-Year rollover on a DB
  with **no saved defaults** and confirm the "Save your setup first" modal appears and **no data is
  purged**, then run Save Defaults and confirm the rollover proceeds.
- **Real-toolchain gate (unchanged):** run `npm run typecheck` + `vitest` on a machine with
  `node_modules` (DEPLOY-CHECKLIST §0), including the Phase-5 tests
  (`accommodation.characterisation` 3-part round-trip; `dashboard.service` 12:30;
  `settings.controller`). They were written, not executed in this env.
- **No open owner decisions remain** from this phase — Z1/T1 are closed as deliberate fixed
  constraints; S1 is fixed. Nothing here is deploy-blocking.
- Nothing pushed/deployed; deployment is the single Phase-7 event.
