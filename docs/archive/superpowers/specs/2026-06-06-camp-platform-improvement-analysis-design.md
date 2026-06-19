# Camp Platform — Improvement Analysis

**Date:** 2026-06-06
**Type:** Analysis / improvement backlog (not a single-feature design)
**Scope decision:** Both surfaces analysed, clearly separated —
- **DEMO** = `camp-platform-demo.html` (the single-file, MockAPI app deployed to `yc-camp-demo.vercel.app`, shown to stakeholders).
- **PRODUCT** = the TypeScript/Express backend + `public/index.html` (the real fetch-based SPA) + the future real database/auth.
**Horizon:** YC2026 **pilot-first** — make the demo genuinely usable and sequence toward a pilot; harden the backend after the demo proves value.
**Depth:** Actionable backlog. Each item carries a rough **effort** (S ≈ <½ day, M ≈ 1–3 days, L ≈ 1–2 weeks) and a **priority** (P1 do-first → P3 nice-to-have).

---

## How the app is built today (grounding)

- **Backend** — clean layered architecture: `api (Express) → controllers → services → repositories (interfaces) → core`. RBAC lives in one file (`access-control.ts`), all input validated with Zod inside services, repos deep-clone on read/write, errors thrown as typed `AppError`s and formatted in one middleware. This is a genuinely good foundation.
- **Persistence** — in-memory by default; optional JSON-file snapshot (`PERSISTENCE=json`). No real database. Auth is a mock provider with an **in-memory token `Map`** (12h TTL, scrypt password hashing).
- **Two UIs, hand-synced** — `camp-platform-demo.html` (1,525 lines, embedded `MockAPI`) and `public/index.html` (1,174 lines, real `fetch`). They share UI code by copy. **They have already diverged:** the home-notices rework, scheduled notices, and student-notes zone/gender filters added in June 2026 exist only in the demo.
- **Tests** — 29 passing (vitest), covering 3 of ~16 services (`access-control`, `auth`, `registrant`). Controllers/middleware/most services untested.
- **Demo characteristics** — 24 screens, ~165 inline styles, low accessibility affordance (~24 aria/role/alt/focus usages across 1,525 lines), no persistence except dismissed-notice IDs in `localStorage`.
- **Dependencies** — `xlsx@0.18.5` is declared but **not imported anywhere in `src`** (imports use the hand-rolled CSV util). It is also the dependency flagged by `npm audit`.

---

## Category 1 — Efficiency & reliability (codebase)

### PRODUCT
| # | Item | Why | Effort | Priority |
|---|------|-----|--------|----------|
| 1.1 | **Kill the dual-UI drift.** Make the demo and the real app render from one UI module, parameterised by a data adapter (`MockAPI` vs `fetch`). Either (a) extract shared render/screen code into one file both load, or (b) build the demo as the real app bundled with a mock adapter. | Biggest reliability risk: every feature must be written twice and they already diverged this session. | L | P1 |
| 1.2 | **Remove the unused, vulnerable `xlsx` dependency.** | Not imported in `src`; it's the `npm audit` finding. Pure win. | S | P1 |
| 1.3 | **Move persistence to a real datastore before any pilot with real data.** Implement the repository interfaces against Postgres (Supabase recommended — matches your existing AU Supabase + the sibling youth apps). `container.ts` is the only wiring change. | Today all data + login tokens vanish on restart. | L | P1 |
| 1.4 | **Real auth + durable sessions.** Replace `MockAuthProvider` + the in-memory token `Map` with Supabase Auth or signed JWTs. | Tokens die on restart and cannot scale past one process; a live camp can't run on that. | M–L | P1 |
| 1.5 | **Server hardening for camp week:** `helmet` security headers, rate-limit `/auth/login` (brute force), confirm the JSON body limit (already present in the Express adapter) and a strict prod CORS allowlist. | Cheap protection once it's internet-facing. | S–M | P2 |
| 1.6 | **Widen test coverage** to the untested high-risk services: check-in, accommodation lock, notification scoping, import, dashboard; add one API/contract test through the Express adapter. | 13 of 16 services have zero tests, and these encode the safeguarding/RBAC rules you least want to regress. | M | P2 |
| 1.7 | **CI on push:** typecheck + test + `npm audit`. | Catches drift/regressions automatically; you've already hit a "typecheck claims 0 errors but doesn't" situation. | S | P2 |
| 1.8 | **Observability:** `/health` endpoint, structured logs with request IDs. | Needed to monitor uptime during the 4 camp days. | S | P3 |
| 1.9 | **Concurrency guards** (version/`updatedAt` check) on accommodation allocation and check-in writes. | Two leaders acting at once can silently overwrite each other. | M | P3 |

### DEMO
| # | Item | Why | Effort | Priority |
|---|------|-----|--------|----------|
| 1.10 | **Persist demo state to `localStorage`** (not just dismissed notices) so a stakeholder's clicks survive a reload. | Makes the demo feel like a real product, not a reset-on-refresh toy. | S–M | P2 |
| 1.11 | **Add a "reset demo" control.** | Lets a presenter restore a clean slate between showings. | S | P3 |
| 1.12 | *(Superseded)* Splitting the 1,525-line file isn't worth it for a throwaway demo — item 1.1 (shared UI) replaces the need. | — | — | — |

---

## Category 2 — User experience (easy & fruitful to use)

### Cross-cutting (both surfaces)
| # | Item | Why | Effort | Priority |
|---|------|-----|--------|----------|
| 2.1 | **Make the mode switch discoverable.** Pre-camp↔at-camp is currently a hidden tap on the badge. Add an explicit labelled control; for admins, a confirm + a one-line "what changes" explainer. | New users don't find it; it's the single most important state in the app. | S | P1 |
| 2.2 | **Teach empty & first-run states.** Every list (notices, notes, check-in, search) should say what to do when empty; search should show recent/suggested rather than a blank box. | Removes "what now?" dead-ends; speeds the core tasks. | M | P1 |
| 2.3 | **One-tap demo login** (role picker) instead of typed credentials. | Stakeholders shouldn't type emails to explore. | S | P1 (demo) |
| 2.4 | **Make daily check-in a fast bulk job:** check in a whole church/group at once, a live progress meter ("42 / 120 in"), and undo. | Check-in is the highest-frequency at-camp task; per-student tapping is slow. | M | P2 |
| 2.5 | **Notices depth:** unread state, "seen" vs "dismiss", and (product) real delivery — push/SMS/email — for urgent camp-wide notices. | The in-app feed alone misses leaders who don't have the tab open. | M–L | P2 |
| 2.6 | **Student notes flow:** quick-add from a camper profile, tags (pastoral / medical / behaviour), plus search & date on top of the new zone/gender filters. | Turns notes from a log into a usable pastoral tool. | M | P2 |
| 2.7 | **Search as the incident fast-path:** recent searches, "this zone only" toggle, medical-flag chips; call/copy already present. | In an incident you need a leader's contact in seconds. | S–M | P2 |
| 2.8 | **Offline-resilient PWA** for rural/flaky wifi (installable, works offline). The demo already runs offline; the real app should too. | Camp sites often have poor connectivity during the days it matters most. | M | P3 |
| 2.9 | **Accessibility as usability:** large tap targets, visible focus, dynamic type, reduced-motion. | Leaders use this one-handed, outdoors, in sun. (Overlaps Category 3.) | M | P3 |

---

## Category 3 — Graphical UX (look & feel)

### Both surfaces
| # | Item | Why | Effort | Priority |
|---|------|-----|--------|----------|
| 3.1 | **Adopt one cohesive SVG line-icon set** in place of the ad-hoc unicode symbols introduced this session. | Unicode glyphs render inconsistently across iOS/Android and look mismatched in weight/alignment; one SVG family gives uniform size, stroke and colour control. | M | P1 |
| 3.2 | **Introduce a small design-token system** — spacing scale (4/8/12/16/24), type scale, radius, elevation, semantic colours (success/warn/danger/info) in `:root` — and retire the ~165 inline styles into utility classes/components. | Consistency + makes restyling trivial; inline styles are why spacing/colour drift today. | M | P1 |
| 3.3 | **Home dashboard hierarchy pass:** clearer stat cards, a calmer notices section, a more legible mode badge. | The home screen is the first impression and the daily hub. | S–M | P2 |
| 3.4 | **Notice-card design:** stronger urgent vs normal distinction, priority icon, relative time, graceful truncation. | Urgency must read at a glance. | S | P2 |
| 3.5 | **Refined palette + contrast pass to WCAG AA** (keep the navy/blue identity, lighten surfaces). | Looks more professional and is readable in sunlight. | S–M | P2 |
| 3.6 | **Microinteractions & loading:** subtle screen/tab transitions, toast polish, skeleton loaders instead of "Loading…". | Perceived speed and quality. | S–M | P3 |
| 3.7 | **Empty-state illustrations + per-screen iconography.** | Friendlier, more guided feel. | M | P3 |

---

## Recommended sequencing (pilot-first)

1. **Phase 0 — Demo polish (now, low risk):** 3.1 icons, 3.2 tokens, 2.1 mode switch, 2.2 empty states, 2.3 one-tap login, 1.10 demo persistence. Makes the stakeholder demo genuinely compelling.
2. **Phase 1 — De-risk the codebase:** 1.1 shared UI (stops the bleeding), 1.2 drop `xlsx`, 1.7 CI.
3. **Phase 2 — Real data:** 1.3 Postgres repositories, 1.4 real auth.
4. **Phase 3 — Harden for live ops:** 1.5 helmet/rate-limit, 1.6 tests, 1.8 health/logging, 2.4 bulk check-in.
5. **Phase 4 — Delivery & reach:** 2.5 real notice delivery (push/SMS), 2.8 PWA, remaining Category-3 polish.

## Out of scope (for now)
- Multi-camp/multi-tenant.
- Parent-facing self-registration portal.
- Native mobile apps (PWA covers the need).

## Open questions for review
- Is Supabase the assumed datastore (consistent with your other apps), or should this analysis stay datastore-neutral?
- For Phase 0, do you want the graphical refresh applied to the demo only, or kept in lockstep with `public/index.html` from the start (which argues for doing 1.1 earlier)?
