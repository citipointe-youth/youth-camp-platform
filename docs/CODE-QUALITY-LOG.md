# CODE-QUALITY-LOG.md — Phase 1 (Category I + behaviour-preserving refactors)

> Running log of refactors made during the improvement initiative: what changed, why it's
> behaviour-preserving, and any latent risk noticed while in the code (watch after deploy).
> Started 2026-06-29.

---

## Phase 0 — bug fixes (logged here where they also improve code health)

### CQ-001 — Scroll-preserving re-loaders were infinite self-recursions (PC-5)
- **Files:** `public/index.html` (`_rAccts/_rFaq/_rFaqEdit/_rSched/_rContacts`).
- **Change:** each helper called *itself* (`await await _rFaq()`); repointed to its matching
  `RENDER.adminAccounts/adminFaq/adminFaqEdit/adminSchedEdit/adminContacts`.
- **Why safe:** the intended behaviour was always "re-render this admin screen, preserving
  scrollTop". The self-call could never have worked (immediate stack overflow), so any code path
  reaching it was already broken; pointing at the real renderer is the only coherent behaviour.
  Cache invalidation for `/faq` and `/schedule` already happens in `api()`→`_invalidate`, so the
  re-render fetches fresh data.
- **Latent risk:** these renderers re-`paint()` the whole screen; if a future edit makes one of them
  heavy, consider a stale-render guard. Low risk today.

### CQ-002 — Removed dead `unpaid` plumbing from the home DTO (PC-3)
- **Files:** `src/services/dashboard.service.ts`, `public/index.html` home render.
- **Change:** dropped `unpaidCount` and `perChurchBreakdown[].unpaid` from `PreCampDashboard` and the
  service; removed the home "N unpaid / All paid" pill.
- **Why safe:** `unpaidCount` was read only by the one home pill; `perChurchBreakdown.unpaid` was in
  the DTO but never read by the SPA. The `paymentStatus` entity field and the separate reminders
  feature (`person.service.chase/breakdown`) are untouched — payment still exists in the model, just
  not surfaced as an app category (owner decision).
- **Latent risk:** none — narrowing a DTO. `chase()` still uses `paymentStatus==='unpaid'` for
  reminders; if PC-3's intent extends to reminders later, revisit.

---

## Phase 1 — foundations

### CQ-003 — Fluid type scale: tokenised ~33 accreted font-size literals → 11-step scale (A1)
- **File:** `public/index.html` `:root` + `<style>` block (mechanical map of 72 `font-size:` literals).
- **Change:** added `--t-display…--t-micro` tokens; mapped every style-block `font-size` literal to
  the nearest token; set `html{font-size:16px}` scaling to 17/18px at 768/1280.
- **Why safe (and the one caveat):** tokens were chosen at the *centres* of the existing literal
  clusters, so each mapping shifts a size by ≤~0.04rem (≤~0.7px) — imperceptible, and the explicit
  intent of "rationalise the type scale". This is **not byte-identical**; it is a deliberate
  normalisation. Two literals left un-tokenised on purpose: `1.85rem` (login h1, unique) and
  `1.65rem` (a tile `.ic` size for soon-to-be-SVG icons).
- **⚠ Watch on-device:** the global root-size bump means *all* rem text grows at tablet/laptop. Flagged
  in DEPLOY-CHECKLIST for eyeballing (esp. dense admin tables and the hero numbers).

### CQ-004 — Tokenised scattered indigo-tint & gender hex (C3)
- **File:** `public/index.html` `<style>` block.
- **Change:** added `--violet-d/-dd, --tint, --tint-2, --lav, --lav-2, --male/-bg, --female/-bg`;
  replaced 25 raw-hex occurrences in CSS rules with the matching token.
- **Why safe:** each token is defined to the *exact* hex it replaced (1:1, no colour change). Pure
  indirection. Body-inline hex (JS template strings) was migrated for the gender colours touched by
  the emoji sweep; remaining body-inline hex is tracked for the per-screen pass.
- **Latent risk:** `#fff` (×26) deliberately NOT folded into `--card` — "card surface" and "any white"
  are different intents; conflating risks subtle regressions. Left as-is.

### CQ-006 — Fixed `${ic…}` injected into single-quoted strings (self-caught regression)
- **File:** `public/index.html` (4 sites: leader blue-card pill, registrant blue-card pill, casualty
  consent line, first-day "all signed in" callbox).
- **Issue:** the CQ-005 emoji sweep inserted `${icSm('check')}` into string segments that were
  **single-quoted**, not template literals — so it would have rendered the literal text
  `${icSm('check')}` (no interpolation), and the inner `'check'` quotes risked breaking the string.
- **Fix:** converted those segments to backtick templates. Then scanned the whole file for any
  single-quoted string containing `${` — **zero remain**.
- **Why safe:** backtick templates interpolate identically to the surrounding code's idiom; no
  behaviour change beyond making the intended icon actually render.
- **Lesson:** when scripting icon injection, only target backtick-delimited segments. Recorded so a
  later phase's sweeps apply the same guard.

### CQ-007 — Service-worker `API_RE` missing `/export` (the documented gotcha, live)
- **File:** `public/sw.js`.
- **Issue:** the SPA downloads `/export/audit`, `/export/registrants`, `/export/signin-out`, but
  `/export` was **not** in `API_RE`. Per CMS's hard-won note, a missing API prefix falls through to
  the cache-first asset path and can get SPA HTML cached under that URL — here it could serve stale
  HTML for a compliance download. Verified `API_RE` against every prefix in `src/api/http/router.ts`.
- **Fix:** added `export` to `API_RE`; bumped cache `camp-v3`→`camp-v4`.
- **Why safe:** network-only is strictly more correct for an API route; cache bump forces eviction.

### CQ-008 — Single nav source (navModel/navSidebar) replaced two drifting lists
- **File:** `public/index.html` (`buildTabs`, `_renderWideNav`).
- **Change:** both now derive from `navModel(role,mode)`; deleted the duplicated per-function tab and
  sidebar arrays. Behaviour-preserving for the cases that worked; **fixes** the empty
  church/zoneLeader sidebar and the broken admin at-camp sidebar (they had no coherent prior output).
- **Latent risk:** `navModel` is the single point of truth now — a wrong entry changes both navs. That's
  the intent (D3); covered by the documented Role×mode grid in debug.md.

### CQ-009 — `paint()` scroll preservation subsumes manual `_r*` save/restore (D5)
- **File:** `public/index.html` (`paint`).
- **Change:** same-screen re-paints keep `scrollTop`; fresh navigations reset to top. The `_r*`
  re-loaders still save/restore but are now redundant on that axis (harmless).
- **Latent risk:** if a future screen *wants* a re-render to jump to top, it must navigate fresh
  rather than re-paint in place. Noted.

### CQ-010 — Accommodation occupant pool now includes leaders in the SPA mirror
- **File:** `public/index.html` (`accomChurches`/`accomGroups`), aligned to backend `computeGroups`.
- **Issue (pre-existing):** the SPA counted only `kind==='camper'` for classroom groups, while the
  backend pooled youth **and** leaders. The SPA group counts could under-count vs the server.
- **Fix:** SPA mirror now counts leaders too (and applies the PC-10 grade-bracket split). Brings SPA
  and backend group maths into agreement.
- **Watch:** the allocation `n` shown in the UI now matches the server's eligible-group `n`; if an
  operator had memorised the old (camper-only) numbers they'll see leaders included now — correct.

### CQ-005 — Emoji/pictograph/affordance glyphs → SVG icon registry (C1/C2)
- **File:** `public/index.html` (ICONS registry + ~60 call sites).
- **Change:** added 13 glyphs (`preview, urgent, medical, phone, classroom, tent, close, arrowr,
  arrowl, download, diamond, plus`) + size helpers `icSm/icLg/icXl` + `emptyState()`; replaced every
  emoji and affordance arrow/✓ in markup with `ic*()`. Toast strings (rendered via `textContent`,
  where SVG can't render) had their trailing `✓` stripped — the toast popup itself is the signal.
- **Why safe:** markup replacements swap a glyph for an inline SVG of equivalent meaning at a
  controlled size; render context (innerHTML) unchanged. Toast text is cosmetic. Verified **zero**
  emoji/pictographs remain and **every** `ic*()` key resolves (no blank icons).
- **Latent risk:** `accLabelOf().text` is dead (only `.primary` consumed) — candidate for removal in
  the I3 dead-code sweep; left in place for now (harmless). One typographic `→` remains in the
  sentence "Admin → Accommodation" (breadcrumb text, intentionally not an icon).

## Phase 2 (2026-06-29) — owner-feedback pass

### CQ-011 — White header at every width (owner) + dead `.two-col` finally wired
- **File:** `public/index.html` (`.bar` base rule + badges; `RENDER.adminSettings`).
- **Change:** the base `.bar` was a violet→navy gradient with white text on phone/tablet and only
  turned white at ≥980px. Owner asked the phone header to match the web header → base `.bar` is now
  white with dark text + a hairline border at all widths; `.role-badge`/`.sign-out`/`.bk` restyled to
  read on white (`.mode-badge`/`#dayBadge` keep their coloured fills, which already read on white).
  The ≥980px `#bar` overrides are now redundant-but-consistent (left in place; they harmlessly
  reinforce the wide layout). Separately, the long-dead `.two-col` rule (defined since Phase 1, used
  nowhere) is now wired into the Settings form so its field pairs sit two-up on laptop.
- **Why safe:** pure CSS + one markup wrap; no JS/data path touched. The JS that sets badge colours
  inline (`_setBar`) writes opaque fills + white text, all legible on white — verified no white-on-white.
- **Watch:** the strong purple identity banner is gone from the top of every phone screen (now neutral
  white); the purple identity still lives in the hero cards. Deliberate per owner. Eyeball on-device.

### CQ-012 — `.wide-cards` dense-list grid at ≥980px (A6 follow-up)
- **File:** `public/index.html` (≥980/≥1280 media blocks; `RENDER.people` `#plist`; `drawBudget` body).
- **Change:** added a `.wide-cards` utility — single column <980px (unchanged), `auto-fill
  minmax(340px,1fr)` 2-up at ≥980, `minmax(300px)` 3-up at ≥1280. Applied to the My Youth roster
  (`#plist`) and the Budget collapsed church rows. An **expanded** Budget church gets
  `grid-column:1 / -1` so its CAMPERS/LEADERS detail spans full width and stays readable. The roster
  stats snapshot (`#psnap`) sits **outside** the grid, so it stays full-width on top (owner decision).
- **Why safe:** all new rules live inside the ≥980px (and ≥1280px) blocks, so phone/tablet are
  byte-for-byte unchanged. The roster/budget renderers emit the same card markup as before — only the
  container's `display` changes — so no logic, no fetches, no test impact. Confirmed `RENDER.people`
  still fetches `/registrants` exactly once (B6 efficiency invariant intact); `.wide-cards>*` zeroes
  the children's `margin-bottom` so the grid `gap` is the single source of spacing.
- **Watch:** if a future screen reuses `.wide-cards`, remember its children must tolerate equal-height
  grid cells (`align-items:start` is set, so they don't stretch). Eyeball the 980↔1281 column steps.

---

## Phase 4 — First-aid login UX (2026-06-29)

### CQ-013 — First-aid records reuse `StudentNote{category:'firstaid'}` — category-scoped RBAC, no migration
- **Files:** `src/services/access-control.ts`, `src/services/note.service.ts`,
  `src/api/controllers/note.controller.ts`, `src/api/controllers/search.controller.ts`,
  `src/api/http/router.ts` (+ tests `note.service.test.ts` NEW, `access-control.test.ts` extended).
- **Change:** added two capabilities — `note:write:firstaid` and `note:read:firstaid` — instead of
  overloading the general `note:write`/`note:read`. `note.service.add` now asserts
  `note:write:firstaid` **only** when `category==='firstaid'` (else `note:write`), so a first-aider
  can create *only* first-aid records and never testimonies/general notes. New
  `note.service.recentFirstAid` returns **only** `category==='firstaid'` notes, scoped by the
  existing `canAccessPerson` (firstAid/director/admin → all, zoneLeader → zone, church → own church).
  Exposed `GET /notes/firstaid`. Also exposed the pre-existing `search.service.resolveContacts` as
  `GET /search/contacts/:camperId` (masked leader contacts for the Student Info "reach the leader"
  card) — reuses `camper:read:sensitive`, **no new permission**.
- **Why safe:** purely additive — new `Action` union members + new Set entries + one new service
  method + two new routes. The general `note:write`/`note:read` paths are unchanged (existing
  testimony/notes tests still hold). The category-scoped assert is the *only* behavioural change to
  `add`, and it can only *narrow* what firstAid may write (firstAid never had `note:write`).
  No schema change: `StudentNote.category` is already free-form and already flows through
  create/recent/CSV-export. Migration `013` stays reserved for Phase 5's C-1 fix.
- **Latent risk:** the first-aid record body is 4 labelled lines (`Problem:`/`Treatment:`/
  `First-aider:`/`Brought by:`) parsed back by a client regex (`_faParse`) for display. If a user
  types a line that itself starts with one of those labels inside a field, the parser could
  mis-split. Low risk (free-text incident notes); the raw body is always preserved verbatim in the
  note + CSV export, so nothing is lost — only the on-screen split could look off.

### CQ-014 — First-aid SPA rebuilt to the Phase-4 UX (Search home · Student Info · Records); tokenised + softened
- **File:** `public/index.html` (CSS `:root` tokens + `.fa-*` block; `navModel` firstAid; `gotoTab`
  home→search redirect; replaced `renderHomeFirstAid`/`loadMedicalWatch`/`openCasualtyCard`/
  `revealMedicare` with `renderSearchFirstAid`/`openStudentInfo`/`openFirstAidLog`/`saveFirstAidLog`/
  `RENDER.records`/`drawFaRecords`/`_faParse`; new `records` section + `TAB_OF`; `drawNotes` First-aid
  filter + badge + Problem/Treatment render).
- **Change:** firstAid nav is now **Search · Records · Schedule** (Medical Watch removed — the
  `/campers/medical` fetch is gone from the first-aid path). The casualty card is renamed **Student
  Info**, re-ranked (medical alert → consent → **leader contacts** → Medicare → dietary → Log action
  → recent logs → parent at the bottom), with allergy-type dietary items merged into the alert.
  Added the action-log form + the Records tab.
- **Why safe (token/quality angle):** all first-aid hardcoded hex (`#1e3a5f`, `#dc2626`, `#b45309`,
  `#94a3b8`, `#16a34a`, `#fef3c7`, `#92400e`, `#0f2035`, `#4f46e5`, `#cfe0ff`) is gone — replaced by
  `:root` tokens, with **new** tokens added: `--ink-2` (darker secondary text for legibility) and a
  softened alert/consent palette (`--alert-*`, `--consent-ok-*`, `--consent-no-*`). This advances the
  C1 (no-emoji/SVG-only) and C3 (token-discipline) goals for the first-aid screens, which had
  predated the Phase-1 sweep. Leader contacts reuse the existing audited reveal path.
- **Verification:** SPA `<script>` syntax confirmed with `node --check` (a real Node v24 found under
  the Playwright driver) — **clean**. While doing so, caught + fixed a stray `}` that had crept into
  `drawNotes` during the First-aid-filter edit (the `box.innerHTML=…:emptyState(…)` statement now
  ends with `;` and the function closes correctly). Backtick parity even; backend TS parse-checked
  via `node --experimental-strip-types --check` (clean).
- **Latent risk:** `RENDER.records` fetches `/campers?pageSize=300` to map camper ids → names for the
  list; on a very large camp this is a second fetch alongside `/notes/firstaid`. Acceptable (same
  pattern as `RENDER.notes`); both are cached 30s. The `home→search` redirect in `gotoTab` is
  firstAid-only and guarded; `RENDER.home` also self-redirects for safety.
