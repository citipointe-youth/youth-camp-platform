# PHASE-5-SIXHATS-REVIEW.md — Whole-program executive review (Phases 1–4)

> **Reviewer:** Phase 5 (fresh instance). A de-Bono **Six Thinking Hats** executive review of the
> WHOLE program (Phases 1–4 combined), then re-run per role (**admin · director · church ·
> zoneLeader · first-aid**).
> **Date:** 2026-06-30.
> **Scope:** the live behaviour of the combined Hub+Portal camp platform after the Phase 1–4
> changes — auth/RBAC, registration/import, budget, accommodation, at-camp ops/check-in, first-aid,
> admin/back-office, offline/PWA, data integrity.
> **Method:** reasoning + a fan-out source sweep (auth/RBAC, registration/lifecycle/import,
> SPA/PWA) + reading the existing vitest suites + targeted greps + a real parser
> (`node --experimental-strip-types --check`, Node v24 under the Playwright driver) on every changed
> file. **No project toolchain** (`npm`/`tsc`/`vitest`/`node_modules` absent) → full `tsc --noEmit` +
> vitest remain gated in `DEPLOY-CHECKLIST §0`. Line numbers accurate at writing; they drift.
> **Posture (owner decision):** *fix clear low-risk issues here; report the rest.*

---

## Verdict

**The program is strong, disciplined, and close to deploy-ready. The two latent defects pinned to
this phase since Phase 3 — C-1 (Critical) and H-2 (High) — are now FIXED in code (with tests), and
one dead-config footgun (JWT_SECRET) was removed.** What remains open is, in order: **one
configuration hardening the owner should decide on (SESSION_SECRET fail-fast), one genuine UX/data
risk in the offline check-in queue, and a tail of visual/cleanup items carried from Phase 3.** None
of the open items is deploy-blocking; the single hard pre-deploy gate (C-1) is closed pending a
real-toolchain `vitest`/`tsc` confirmation.

The architecture continues to pay off: RBAC lives in one file, business logic is pure and testable,
the persistence swap-surface is a single composition root, and the SPA derives nav from one
`navModel`. The correctness-critical cores (budget, check-in session generation, accommodation
split, presence model) are well-isolated and honestly tested.

---

# PART A — By Hat (whole program)

## ⚪ White Hat — what the system objectively does now (per functional area)

- **Auth.** Stateless HMAC-SHA256 signed sessions (`auth.service.ts`), 12 h TTL, full actor embedded
  in the token (no DB round-trip per request). Passwords: `scrypt` + 16-byte random salt +
  `timingSafeEqual` (`utils/crypto.ts`). Signature verify is timing-safe. Login is rate-limited
  10/IP/15 min (per-instance). Logout is client-side only (tokens valid until TTL).
- **RBAC.** One file (`access-control.ts`). Five roles. `attendance:write` is split from
  `checkin:write` (firstAid gets attendance only). First-aid records are gated by category-scoped
  `note:write:firstaid` / `note:read:firstaid`. Scoping via `canAccessPerson` / `canAccessChurch` /
  `canSendNotification`.
- **Registration / import.** CSV is authoritative: Elvanto-mapped (29 canonical headers + aliases),
  BOM-stripped, dedup by (church, name, phone), in-file last-row-wins, phantom-church detection,
  **dry-run preview before commit**, and persons absent from the upload are deleted (count surfaced
  in the preview).
- **Presence model (P0).** `atCamp` and `lifecycle` are orthogonal; daily `checkIn()` touches neither
  and is guarded against `cancelled`/`!atCamp`; roster and `checkInsDue` filter on `atCamp===true`.
- **Budget.** Pure `budget.ts`; groups by per-registrant `registrationCost`; null cost kept as a
  flagged "Cost not recorded" line; grand total reconciles to the sum of line totals.
- **Accommodation.** Classroom rooms + an allocation map; eligible groups per church×gender (≥75%
  classroom-kind); PC-10 splits a >50 pool into 7-9 / 10-12 sub-pools; single-gender rooms;
  auto-fill + un-allocate cascade; tents auto-bucketed for display.
- **At-camp ops.** Twice-daily synthetic sessions (AM 08:00 / PM 13:00) derived from `checkInDays`;
  first day PM-only, last day AM-only; optimistic check-in queue with a 4 s undo window.
- **First-aid (Phase 4).** Nav = Search · Records · Schedule; Student Info re-ranked
  (alert→consent→leader contacts→Medicare→dietary→log→recent→parent); records are `StudentNote`
  with `category:'firstaid'` (4-line body); church can read own-church records.
- **Admin / back-office.** Settings, accounts, accommodation, FAQ, schedule, devotionals, mode
  switch; `newYear` (rollover, requires snapshot, restores scaffold password-less) vs `reset`
  (full wipe to bare) — both guarded by export-or-force+confirm.
- **Offline / PWA.** `sw.js` (`camp-v5`); API routes network-only (all 20 prefixes + health in
  `API_RE`); shell network-first; assets cache-first; `controllerchange`→one reload. Client 30 s GET
  cache with write-invalidation; `_prefetch`; stale-while-revalidate `_navTo`.

## 🔴 Red Hat — instinct / where it *feels* wrong or risky

- The **optimistic check-in queue** is the one place that makes me uneasy. The happy path is lovely,
  but the failure path quietly drops a tap (red dot, no words, no retry) — and on a phone in a paddock
  with flaky signal, that's exactly when leaders will lean on it hardest. "I tapped them in" vs "the
  system has them out" is the kind of mismatch that erodes trust in a roll-call tool.
- **SESSION_SECRET silently falling back** in production "feels" wrong for an app holding minors'
  medical and contact data. A warning in a log nobody reads is not a safeguard.
- **`reset` to bare** is a big red button; the typed-confirmation guard is good, but I'd want the
  word "EVERYTHING including churches & accounts" right next to the button.
- The first-aid screens are now genuinely calm and usable — that *feels* right for the persona.

## ⚫ Black Hat — failure modes, security/data-loss, correctness (the most important hat)

> Severity tags: **C** critical · **H** high · **M** medium · **L** low. Status: **FIXED-HERE** /
> **OPEN**.

### C-1 (Critical) — PC-10 split allocations were not persisted — **FIXED-HERE**
**Where:** `accommodation.service.ts:setAllocations`/`rowsToMap`; `core/entities/accommodation.ts`
(`RoomAllocation`); `supabase/supabase.allocation.ts`; table `classroom_allocations`.
A church×gender pool >50 splits into sub-pools with a **3-part** key `churchId|gender|bracket`.
`setAllocations` destructured only `[churchId, gender]` and `RoomAllocation` had no bracket column,
so the bracket was thrown away on save; on reload `rowsToMap` rebuilt the 2-part key, which matched
**no** live group — split allocations silently vanished and never decremented availability. Masked
because the only round-trip test used a non-split 2-part key.
**Fix (this phase):** migration `013_allocation_bracket.sql` adds a nullable `bracket` column;
`RoomAllocation.bracket?: AllocationBracket | null`; `setAllocations` parses all parts and saves
`bracket ?? null`; `rowsToMap` rebuilds the 3-part key when a bracket is present; the Supabase repo
maps the column; **new round-trip test** (H-1) drives a 60-person single-gender split through
save→load and asserts the 3-part key survives. **Recommendation:** run vitest + `tsc` on the real
toolchain and apply migration `013` before deploy (it is idempotent + backward-compatible).

### H-1 (High) — test gap that hid C-1 — **FIXED-HERE**
No integration test exercised `setAllocations`→`getAllocations` with a 3-part key. Added one in
`accommodation.characterisation.test.ts`.

### H-2 (High) — dashboard vs check-in disagreed on "current session" (12:00–13:00) — **FIXED-HERE**
**Where:** `dashboard.service.ts` vs `checkin-sessions.currentSession` (`PM_FROM='12:00'`).
The dashboard reimplemented the calc as `startTime <= now`; PM `startTime` is `13:00`, so at e.g.
12:30 the dashboard resolved **AM** while check-in resolved **PM** — the at-camp home counted
`checkInsDue` against the AM roster for that hour while a leader tapping Check-in landed on PM. It
also contradicted `CLAUDE.md` and its own inline comment.
**Fix (this phase):** `dashboard.service` now imports and uses the shared `currentSession` helper
(today-only guard kept; `nextSession` derived by position). **New 12:30 test** asserts `PM` and
`nextSession===null`; existing 10:00/15:00 tests still hold.

### B-1 (High) — optimistic check-in queue hard-drops on any online error — **OPEN (owner)**
**Where:** `public/index.html` `drainQueue()` (~L1192–1206).
```js
}catch(e){
  if(!navigator.onLine)break;        // offline → wait for 'online'
  CHECKIN_QUEUE.shift();_markSynced(entry.camperId,'error');  // online error → DROP, red dot only
}
```
On *any* error while online (a 4xx, a transient 5xx, a serverless cold-start timeout), the entry is
shifted off and marked with a red dot — **no retry, no toast, no record**. Two compounding gaps:
(a) the queue is an in-memory array, so a tab close / crash / refresh mid-drain **loses all pending
entries**; (b) there is no surfaced "these N check-ins failed" summary — only per-row dots that
disappear on the next `RENDER.checkin()`. Net: a leader can believe a child is checked in when the
server has no record. **Recommendation (owner, design-level):** distinguish 4xx (surface + offer
manual retry) from transient errors (bounded auto-retry with backoff); persist `CHECKIN_QUEUE` to
`localStorage` and resume on load; show a persistent "N unsynced" banner until the queue drains.
*Left open:* changes runtime behaviour and needs on-device testing; not deploy-blocking (the happy
path and offline-then-online path work).

### B-2 (Medium) — SESSION_SECRET falls back to a constant in production — **OPEN (owner)**
**Where:** `auth.service.ts:18-27`. With `SESSION_SECRET` unset in prod, signing uses a hardcoded
`INSECURE_FALLBACK` and only `console.error`s. Anyone who knows the constant (it's in the source)
can forge a token for **any role**, including admin. **Recommendation:** fail-fast — `throw` on
startup when `NODE_ENV==='production'` and the secret is unset/equal to the fallback. *Left open:*
it's a one-line behaviour change that turns a warning into a hard boot failure; the owner should
confirm the deploy always sets the env var first (CLAUDE.md already marks it REQUIRED, and prod is
configured with it — so this is defence-in-depth, not an active prod hole).

### B-3 (Medium) — multi-tab / concurrent mode-switch desync — **OPEN (owner)**
`CAMP_MODE` is a global; `RENDER.home` re-syncs from `/settings` only on home navigation. Two tabs
(or a tab not on home) can show pre-camp nav after an admin flips to at-camp until the user navigates
home. No cross-tab `storage`-event sync. **Recommendation:** a `storage`/`visibilitychange` listener
that re-fetches `/settings` and rebuilds tabs. Low blast radius (read-only mismatch; writes are still
server-authoritative). *Left open:* additive UX.

### B-4 (Medium) — over-broad client-cache invalidation — **OPEN (note)**
`_invalidate('/settings')` also clears `/schedule` + `/checkin`, and any `/import*` write clears the
**entire** cache. Conservative and correct, but causes re-fetch churn on busy days. *Acceptable;
noted for a perf pass.*

### B-5 (Low) — per-instance login rate limit — **OPEN (note, by design)**
10/IP/15 min is per-instance; on N serverless instances the effective limit is 10×N. Acknowledged in
the code as an acceptable backstop given scrypt + no shared store. *Noted.*

### B-6 (Low) — `note.service` first-aid body is parsed by a client regex — **VERIFIED OK**
`_faParse` (index.html ~L1445) matches `^(Problem|Treatment|First-aider|Brought by):`. If a field's
text contains a newline + a label-like line, the parsed *view* could mis-split, but it **degrades
gracefully**: the parsed problem snippet falls back to the raw body (`p.problem||n.body`), and the
raw body + CSV export are always intact. *No action; the Phase-4 handoff concern is satisfied.*

### B-7 (Low/By-design) — import deletes persons absent from the CSV — **VERIFIED OK**
`import.service.ts:335-342` deletes anyone not in the upload ("the upload is authoritative"). This is
intentional and the **dry-run preview surfaces the delete count in red before commit**
(`_renderImportPreview`, index.html ~L2627). *No action; documented behaviour with a guard.*

## 🟡 Yellow Hat — what is genuinely strong (protect from regression)

- **RBAC discipline.** One file, declarative `Record<Role, Set<Action>>`, comprehensively tested,
  enforced at the service layer (not controllers). The `attendance:write` ÷ `checkin:write` split and
  the category-scoped first-aid capabilities are precise and correct.
- **Pure, tested cores.** Budget reconciliation, check-in session generation, the accommodation
  split computation, and the presence-model transitions are isolated pure functions with honest
  tests — the safest possible foundation.
- **Presence model.** The `atCamp`/`lifecycle` orthogonality is enforced exactly as documented; the
  roster and `checkInsDue` scoping prevents departed campers inflating counts.
- **Crypto.** scrypt + salt + timing-safe compares; HMAC sessions survive serverless cold starts.
- **Import robustness.** BOM stripping, alias-tolerant headers, phone-dedup, dry-run-before-commit
  with a visible delete count — defensive where it matters.
- **Single-source nav + stateless sessions + one composition root** — the architecture keeps change
  cheap and review tractable.

## 🟢 Green Hat — high-leverage ideas worth considering

- **Persist the check-in queue** (localStorage) + a "N unsynced" banner — turns the optimistic queue
  from "trust me" into "provably durable" (pairs with B-1).
- **Fail-fast secrets + a `/health` that asserts config** (SESSION_SECRET set, PERSISTENCE reachable)
  so a misconfigured deploy is loud, not silent (pairs with B-2).
- **A tiny `splitKey()` helper** shared by `accommodation-allocation.ts` and `accommodation.service`
  so the 2-vs-3-part key shape lives in one place (C-1 showed the cost of two parsers drifting).
- **Cross-tab mode sync** via the `storage` event (pairs with B-3).
- **Adopt the dead spacing/shadow/colour tokens** (L-1) in a focused C5 pass, or delete them.

## 🔵 Blue Hat — process, readiness, sequencing

- **Readiness:** the one hard gate (C-1) is closed in code with a regression test; H-2 likewise. The
  honest blocker now is *verification*, not *implementation*: the changed `.ts` parse-clean, but
  `tsc --noEmit` + `vitest` must be run on a real machine before deploy (DEPLOY-CHECKLIST §0).
- **Migration sequencing:** `013` is the next free number and is idempotent + backward-compatible —
  apply it with (or before) the deploy. No other migration is needed this phase.
- **Decide-before-deploy (owner):** B-2 (SESSION_SECRET fail-fast — yes/no) and B-1 (check-in queue
  durability — ship now or fast-follow). Everything else is post-deploy polish.
- **Deploy gotchas re-confirmed:** `tsconfig` CommonJS/Node untouched; `.gitignore` `/data/` still
  anchored; nothing pushed/deployed.

---

# PART B — By Role (primary journeys, per functional area)

> Re-running the lens per role surfaces problems invisible from the admin seat. Severity + status as
> above.

## 👤 Admin (all + back office)
- **Journey:** set up churches/accounts/accommodation/FAQ/schedule/devotionals → save defaults →
  import registrants → manage budget/accommodation → switch mode → run camp → new-year rollover.
- **Accommodation (was broken for the admin specifically):** **C-1** hit the admin/director
  Accommodation screen hardest — for any church large enough to split (>50 of one gender), saving an
  allocation appeared to succeed but vanished on reload, and the split sub-pools rendered as fully
  unallocated. **FIXED-HERE.** Verify on-device with a >50 single-gender church after deploy.
- **At-camp dashboard:** **H-2** gave the admin a wrong `checkInsDue` and current-session label for
  the 12:00–13:00 hour. **FIXED-HERE.**
- **Wipe paths:** `newYear` requires a snapshot (throws otherwise) and restores accounts
  **password-less** (operator must reset — KNOWN RISK R9); `reset` wipes to bare. Both guarded.
  *Red-hat:* the bare-reset button copy could be blunter about scope (B-ux, L). 
- **Config:** **B-2** (SESSION_SECRET) and the now-removed **JWT_SECRET footgun** are admin/deploy
  concerns — JWT_SECRET **FIXED-HERE** (was a trap: setting it did nothing).

## 👤 Director (camp-wide, no admin:manage)
- **Journey:** import → camp-wide notices → budget/accommodation read+write → notes → check-in.
- **Accommodation:** director can `setAllocations` (`assertDirectorOrAdmin`) → same **C-1** exposure,
  **FIXED-HERE**.
- **Dashboard:** same **H-2**, **FIXED-HERE**.
- **First-aid:** director holds `note:write:firstaid` + `note:read:firstaid` and reads first-aid
  records through the admin Notes "First-aid" filter — correct.
- No director-specific defects beyond the shared two. The Phase-1 director wide-nav sidebar (BUG-09)
  remains populated.

## 👤 Church (own church only)
- **Journey:** registrations (read/write own) → daily check-in → write notes → at-camp home tile →
  read own-church first-aid records.
- **Scoping is the risk surface here, and it holds:** `canAccessPerson`/`canAccessChurch` confine
  church to `churchId`; the at-camp dashboard totals are scoped (Phase-1 D2 fix, pinned by
  `dashboard.service.test.ts`); `getChurchRooms` rejects cross-church reads. **First-aid read** is
  own-church only (`note:read:firstaid` + `canAccessPerson`), with **no write** and **no general
  note:read** — verified in `access-control.ts` and pinned by `note.service.test.ts`.
- **Check-in queue (B-1)** bites church users too — a church leader doing roll-call on a phone is the
  exact persona that can silently lose a tap. **OPEN.**
- **Mode desync (B-3):** a church user with the app open when the admin flips to at-camp keeps
  pre-camp nav until they navigate home. **OPEN (low).**
- **Accommodation:** church only *reads* its rooms (`getChurchRooms`), which surfaces name/gender/n
  and is unaffected by C-1's persistence bug — but if C-1 had shipped, a split church would have seen
  its classroom rooms appear empty. Now correct.

## 👤 Zone Leader (own zone)
- **Journey:** zone-scoped registrant read, check-in, read notes, send **zone** notices, read
  first-aid records (zone-scoped).
- **Scoping holds:** zone notices gated by `canSendNotification` (zoneLeader → own zone only);
  `note:read` + `note:read:firstaid` both zone-scoped via `canAccessPerson`. zoneLeader correctly
  lacks `registrant:write` (read-only on registrants) and `notification:send:camp`.
- Shares **H-2** (dashboard) — **FIXED-HERE** — and **B-1**/**B-3** — **OPEN**. No zone-specific
  defect found.

## 👤 First-aid (Phase 4 — re-checked here, since Phase 4 was its own review)
- **Journey:** Search (landing) → Student Info → call leader / log action → Records → Schedule.
- **RBAC is the security-critical piece and it is correct:** firstAid has `camper:read` +
  `camper:read:sensitive` + `attendance:write` + `note:write:firstaid` + `note:read:firstaid` and
  **nothing else** — no `checkin:write` (cannot record daily sessions, only presence), no general
  `note:read`/`note:write` (no testimonies/general notes), no registrant/admin access.
  `note.service.add` asserts the firstaid capability **only** when `category==='firstaid'`. Pinned by
  `access-control.test.ts` + `note.service.test.ts` (re-run them on the real toolchain to confirm
  green — they were written, not yet executed here).
- **Body parser (B-6):** `_faParse` degrades gracefully; raw body + CSV intact. **VERIFIED OK.**
- **Leader contacts** reuse the existing masked `/search/contacts/:id` reveal (audited,
  `camper:read:sensitive`) — no new permission, correct.
- First-aid does **not** touch accommodation/dashboard, so C-1/H-2 don't apply to it.

---

## Fixed this phase (low-risk / pinned-gate, in place)

| ID | Severity | What | Files |
|----|----------|------|-------|
| C-1 | Critical | PC-10 split allocations now persist (bracket carried through save/load) | migration `013` (NEW); `core/entities/accommodation.ts`; `services/accommodation.service.ts`; `repositories/supabase/supabase.allocation.ts` |
| H-1 | High | Round-trip test for a 3-part split key | `services/accommodation.characterisation.test.ts` |
| H-2 | High | Dashboard uses the shared `currentSession` helper (12:00–13:00 fixed) | `services/dashboard.service.ts`; `services/dashboard.service.test.ts` (NEW 12:30 test) |
| — | Low | Removed dead/misleading `JWT_SECRET` env key (session signing uses `SESSION_SECRET`) | `config/env.ts` |

Verified by `node --experimental-strip-types --check` on every changed `.ts` (all clean). Full
`tsc --noEmit` + `vitest` gated in DEPLOY-CHECKLIST §0.

## Owner decisions (locked 2026-06-30) → Phase-5 remediation

The owner reviewed this doc and chose what to build *now* (a remediation sub-phase) vs defer. The
design + build are tracked in `docs/PHASE-5-REMEDIATION-DESIGN.md` and
`docs/PHASE-5-REMEDIATION-PLAN.md`.

| ID | Severity | Decision | Notes |
|----|----------|----------|-------|
| B-1 | High | **Banner only** (not full durability) | Surface a visible "N unsynced / N failed" indicator; **keep** the current drop-on-error + no-persistence behaviour. *Residual risk accepted:* a tab close mid-drain still loses pending entries, and a hard-dropped 4xx is still lost — the banner makes both *visible* but does not prevent them. Full durability (localStorage queue + retry) deferred to a later phase. |
| B-2 | Medium | **Fail-fast on startup** | `throw` on boot when `NODE_ENV==='production'` and `SESSION_SECRET` is unset / equals the in-source fallback. (No `/health` config assert this phase.) |
| B-3 | Medium | **Build** | Cross-tab mode sync via a `storage` listener. |
| B-4 | Medium | **Build** | Narrow the over-broad `_invalidate` mappings. |
| M-1/M-2/M-3 | Medium | **Build** | 44px targets / 11px type floor / hex→token discipline. Eyeball on device after. |
| L-1 | Low | **Build (delete dead tokens)** | Delete only the **genuinely** zero-reference tokens (`--s1/--s5/--s6/--s7`, `--r-lg`, `--shadow`, `--amber`, `--green`, `--ok`); keep the now-used ones (`--s2/3/4`, `--r-sm`, `--r`, `--shadow-sm`, `--tint-2`). The Phase-3 list had drifted. |
| Reset copy | Low | **Build** | Make the bare-reset confirmation copy blunter about scope (wipes ALL churches & accounts). |
| L-3 | Low | **Defer** | `.statband` column step — not selected. |
| R9 | Note | **Defer to Phase 6** | newYear restores accounts password-less — examined in the year-to-year reuse review. |

---

## Prioritised "before redeployment" shortlist

1. **Run the real toolchain** — `npm install && npm run typecheck && npm run test`. Confirm the C-1
   (`accommodation.characterisation`) and H-2 (`dashboard.service`) tests, plus the Phase-4 RBAC
   tests (`access-control` / `note.service`), all pass green. *(Hard gate — everything below assumes
   this is clean.)*
2. **Apply migration `013_allocation_bracket.sql`** with (or just before) the deploy — idempotent,
   backward-compatible. **C-1's fix is inert in prod without it.**
3. **Decide B-2 (SESSION_SECRET fail-fast)** and **confirm** `SESSION_SECRET` is set in the Vercel
   env (it is required and currently configured — this is the moment to verify, not assume).
4. **B-1 check-in queue:** owner chose **banner only** — a visible "N unsynced / N failed" indicator
   ships this phase; full durability (localStorage queue + retry) is a documented later-phase
   follow-up. Residual tab-close / 4xx-drop risk is accepted and now *visible*.
5. **On-device eyeball:** the >50 single-gender accommodation split (C-1 path), the 12:00–13:00
   dashboard (H-2 path), the M-1/M-2/M-3 visual items, and the check-in unsynced banner.
6. **Built this phase (remediation sub-phase, see the design + plan docs):** B-2 fail-fast, B-1
   banner, B-3 cross-tab sync, B-4 cache tuning, M-1/M-2/M-3, L-1 dead-token deletion, reset copy.

---

*Prepared for the owner. The next step (per the brief) is to turn all current and outstanding
recommendations/fixes into a design document + implementation plan, then execute. Nothing pushed or
deployed; deployment remains a single event after Phase 7.*
