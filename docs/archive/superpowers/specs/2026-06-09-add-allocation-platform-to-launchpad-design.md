# Add the Youth Allocation platform to the camp launchpad

**Date:** 2026-06-09
**Status:** Approved (design)

## Problem

The Vercel launchpad at https://yc-camp-demo.vercel.app (served from this repo's
`demo-site/`, auto-deployed on `git push origin master`) currently presents a single
platform — the Youth Camp Platform — with three artifacts: a demo app, an executive
brief, and training material. A second tool, the **Youth Allocation Platform**, now
has the same three artifacts (delivered as three self-contained HTML files). They
should appear on the **same launchpad** so stakeholders reach both tools from one place.

The launchpad already carries a suite framing: `suite-briefing.html` is the
"Youth Society Brisbane" suite-wide executive briefing ("Start here"). Adding the
allocation platform makes the launchpad a genuine two-tool suite.

## Source material

The allocation files live at
`../youth-allocation-platform/demo-site/` (sibling folder, from the `church-hub`
`youth-allocation-platform.zip`):

| File | Title | Role |
|------|-------|------|
| `allocation-platform.html` (~180 KB) | "YS Brisbane — Demo" | offline demo app |
| `exec-presentation.html` (~28 KB) | "Youth Allocation — Executive Briefing" | exec brief |
| `training.html` (~35 KB) | "Youth Allocation — Training & How-To" | training |

All three are fully self-contained: **no** local image/CSS/JS asset dependencies.
They cross-link to each other by filename (`allocation-platform.html`,
`exec-presentation.html`, `training.html`).

## Design

### 1. File placement & rename (collision fix)

Copy the three files into `demo-site/`. Two names collide with existing camp files
(`exec-presentation.html`, `training.html`), so rename on the way in:

| Source (allocation) | → Deployed name in `demo-site/` |
|---|---|
| `allocation-platform.html` | `allocation-platform.html` *(no collision — keep)* |
| `exec-presentation.html` | `allocation-exec.html` |
| `training.html` | `allocation-training.html` |

Then fix the internal cross-links inside the three copied files so they point at the
new names (`allocation-exec.html`, `allocation-training.html`,
`allocation-platform.html`), and any "back to launchpad" link points at `index.html`.
No assets to copy.

### 2. Restructure `demo-site/index.html` into grouped sections

Layout = single scrolling page (chosen over a two-level chooser or a flat list):

- Retitle the hero from "The camp platform" → suite-level
  (**"Youth Society Brisbane · App Demos"**) with a one-line suite lead.
- Keep the existing **"Start here" suite briefing** card (`suite-briefing.html`) on top, unchanged.
- Two labelled group headings, each with its platform's three cards, reusing the
  existing card styles:
  - **Youth Camp Platform** — Camp briefing (`exec-presentation.html`),
    Camp demo (`camp-platform.html`), Training (`training.html`). These are the
    current cards, regrouped under the heading.
  - **Youth Allocation Platform** — Allocation briefing (`allocation-exec.html`),
    Allocation demo (`allocation-platform.html`), Training (`allocation-training.html`).
- The allocation demo card mirrors the camp demo card (description + demo logins).
  Logins (password `demo1234`): `admin@youth.ministry` (admin),
  `director@youth.ministry` (director), `g79@youth.ministry` (quad leader, 7–9 Girls).

### 3. Deploy & verify

1. `node --check` the embedded `<script>` of each new/edited HTML file.
2. `git add -A && git -c core.autocrlf=true commit && git push origin master` (auto-deploys).
3. Cache-bust `curl` each new URL (`/allocation-platform.html`, `/allocation-exec.html`,
   `/allocation-training.html`) for HTTP 200, and confirm `index.html` shows both groups.

## Out of scope

- `suite-briefing.html` content — left as-is (already the suite-wide briefing).
- The separate live `youth-allocation-app` (Project 2, SvelteKit + Supabase) — this is
  only the offline demo, unrelated to that deployment.
- The source `youth-allocation-platform/` folder stays in place; we copy *from* it.

## Verification / success criteria

- Launchpad shows the suite briefing on top, then a Youth Camp group (3 cards) and a
  Youth Allocation group (3 cards).
- All six platform cards + the suite briefing open the correct page; no 404s.
- Allocation files' internal nav (demo ↔ exec ↔ training, back to launchpad) works
  with the renamed files.
- Live site reflects the change after push.
