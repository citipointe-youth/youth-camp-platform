# Design — Training page + Executive brief polish

**Date:** 2026-06-08
**Scope:** `Camp Platform/demo-site/` (the static demo deployed to https://yc-camp-demo.vercel.app)

## Goal

1. Create **new training material** for the combined Youth Camp Platform as an HTML page in the demo, and link it from the launchpad.
2. **Polish** the existing executive brief (`exec-presentation.html`) — copy/flow/stats only, no structural rewrite.

There is currently no training material for the combined app; all existing training docs are archived `.docx` files for the old, separate Hub/Portal apps and are out of scope.

## Deliverables

### 1. `demo-site/training.html` (new)

Role-tabbed, scrollable how-to guide. Mobile-first, styling matched to `index.html` (navy radial gradient background, white rounded cards, sky accents, demo badge).

Structure:
- **Header** — title "Youth Camp Platform — Training & How-To", one-line intro, demo-login reminder (`demo1234`), "Demo only · fictional data" badge.
- **Start here (everyone)** — signing in (quick-login buttons + ↺ Reset demo data), the tab bar, the **mode badge** (pre-camp ↔ at-camp), the Day 1/Day 2 badge.
- **Role switcher** — Church · Zone Leader · Director · Admin. Selecting a role filters the guide to that role (client-side JS, no backend).
- **Per role: Pre-camp block + At-camp block**, each a short list of task cards grounded in the real screens:
  - *Church*: Home status band; My Youth (filters, accommodation as Tent/Classroom); notices; registration code. At-camp: daily check-in; student notes; camp sign-out/sign-in; "Your Accommodation" tile.
  - *Zone Leader*: zone-scoped My Youth + by-ministry; send zone notices (schedule/delete); read testimonies/notes + CSV export.
  - *Director*: camp-wide rollups; Budget & costings; Accommodation allocations (classrooms + Tent City); camp-wide notices.
  - *Admin*: everything + Admin console — camp settings, accounts, accommodation, FAQ, schedule, devotionals, mode switch, Set defaults / Start new year.
- **Footer** — links back to launchpad + exec briefing; "Add to Home Screen" tip.

### 2. `demo-site/index.html` (launchpad) — edit

Add a third card linking to `training.html` ("📘 Training & how-to guides — role-by-role walkthroughs").

### 3. `demo-site/exec-presentation.html` — polish only

Tighten copy/flow, verify the stats (~1,000 students / ~23 churches / 4 zones / 4 days / 2× check-ins), update year framing where needed, minor visual nits. Optionally add a "Training included" line on the final slide. No structural change to the 9 slides.

## Constraints / non-goals

- Pure static HTML/CSS/JS, self-contained, offline-capable (same as the rest of `demo-site/`). No backend, no build step.
- Content must match current app behaviour (roles, modes, tabs, terminology).
- Out of scope: archived `.docx` training files; the backend; `public/index.html`.

## Ship

Edit → (training.html has JS: syntax-check the script) → commit with `git -c core.autocrlf=true` → `git push origin master` auto-deploys → verify live with a cache-busted curl.
