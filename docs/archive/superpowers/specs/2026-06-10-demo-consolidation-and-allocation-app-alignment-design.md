# Demo consolidation + youth-allocation-platform alignment — design

**Date:** 2026-06-10
**Status:** Approved (pending spec review)

## Problem

Demo HTML is duplicated and the duplicate has drifted:

- `Camp Platform/demo-site/` is the **live Vercel deploy source** (project `yc-camp-demo`, git-connected to `github.com/987tom1/youth-camp-platform`, served via `vercel.json` → `outputDirectory: demo-site`). It holds the **canonical** demos: `allocation-platform.html` (188 KB, Jun 10), `allocation-exec.html`, `allocation-training.html`, `camp-platform.html`, `exec-presentation.html`, `suite-briefing.html`, `training.html`, the landing `index.html`, and `assets/`.
- `youth-allocation-platform/demo-site/` is a **stale snapshot** — `allocation-platform.html` (179 KB, Jun 9) plus superseded `exec-presentation.html` / `training.html`.

Two problems follow:
1. **Duplication** — demo material lives inside the "real" app folders (both `Camp Platform/` and `youth-allocation-platform/`), and the youth-allocation-platform copy is out of date.
2. **Drift** — the real `youth-allocation-platform` app (`public/index.html` SPA + `src/` backend) has not received the tweaks made to the canonical `allocation-platform.html` demo.

## Goals

1. Eliminate demo duplication: demos live in exactly one place, outside the real app folders.
2. Keep the live demo URL working (`yc-camp-demo.vercel.app`).
3. Bring the real `youth-allocation-platform` app in line with the canonical demo's tweaks.

## Non-goals

- Deploying the youth-allocation-platform backend (it remains a local reference app, port 4300).
- Changing demo content/behavior. The canonical demo is the source of truth; we relocate it as-is.
- Refactoring the Camp Platform or allocation backends beyond what the alignment requires.

## Decisions (confirmed with user)

| Decision | Choice |
|----------|--------|
| Consolidated demo location | New top-level folder `youth app demo/`, sibling of the two app folders. Becomes the deploy source. |
| Folder name/scope | Named exactly `youth app demo`; holds **all** demos including `camp-platform.html`. |
| Deploy mechanism | Reuse the existing `yc-camp-demo` Vercel project via **CLI deploys** (`vercel deploy --prod --yes`) from the new folder. Same project, same URL. User performs a one-time **Git-disconnect** of the project in the Vercel dashboard. |
| Alignment depth | Apply each demo tweak **to the layer where it belongs** — `public/index.html` for UI/behavior, `src/` (seed/services/types) where data shape or RBAC changed. |

## Target structure

```
Project 4 - YOUTH CAMP 2025 Optimisation/
├── youth app demo/                  ← NEW. Sole home for deployed demo HTML; Vercel deploy source.
│   ├── index.html                   (landing / launchpad)
│   ├── camp-platform.html
│   ├── allocation-platform.html     (canonical 188 KB)
│   ├── allocation-exec.html
│   ├── allocation-training.html
│   ├── exec-presentation.html
│   ├── suite-briefing.html
│   ├── training.html
│   ├── assets/
│   ├── vercel.json                  (static serve of this folder)
│   └── .vercel/                     (linked to yc-camp-demo project)
├── Camp Platform/                   ← real camp app only: src/, public/, docs/. demo-site/ + vercel.json removed.
└── youth-allocation-platform/       ← real youth app only: src/, public/. demo-site/ removed.
```

## Plan of work

### Phase 1 — Consolidate demos (file moves)
1. Create `youth app demo/`.
2. Move every file from `Camp Platform/demo-site/` (incl. `assets/`) into it.
3. Delete `youth-allocation-platform/demo-site/` (stale).
4. `node --check` the extracted `<script>` of each moved HTML to confirm nothing broke in transit.

### Phase 2 — Re-point deployment
1. Move `Camp Platform/.vercel/` → `youth app demo/.vercel/` (keeps the `yc-camp-demo` project link).
2. Add `youth app demo/vercel.json` serving the folder statically (root output, no build).
3. Remove `Camp Platform/vercel.json` (no longer the deploy root).
4. Remove `demo-site/` from the `youth-camp-platform` git repo and commit (the repo keeps the real camp backend only).
5. **Manual step (user):** in the Vercel dashboard, disconnect Git on the `yc-camp-demo` project so the now-demo-less repo cannot auto-deploy an empty site.
6. Deploy: `vercel deploy --prod --yes` from `youth app demo/`.
7. Verify with cache-busted `curl` against `https://yc-camp-demo.vercel.app/...` for each demo + the landing page.

### Phase 3 — Align the real youth-allocation-platform app
Source of truth: the canonical `allocation-platform.html` and the "Demo-site UI patterns" section of `youth-allocation-platform/CLAUDE.md` (which already documents the deployed version's behavior).

Concrete delta (functions present in canonical, absent in stale snapshot) — to be ported to the real app at the correct layer:

- **Dedup / allocation integrity:** `addAllocation`, `dedupeAllocations` → already enforced server-side via repos/services in the real app; verify parity, port any missing client guard into `public/index.html`.
- **Student-detail leader assignment:** `assignSD`, `unassignSD`, `sdLeaderSearch`, `sdEligibleLeaders` → SPA (`public/index.html`) UI + wire to existing allocation API endpoints.
- **Home attendance tiles:** `attTile`, `svcSessFor`, `homeGradeMini`, `toggleHomeQuad` → SPA; data sourced from existing attendance/series endpoints.
- **Quad helpers:** `quadGender`, `quadGrades` → SPA (derivable) and/or `src/core/enums` if the real app needs them server-side.
- **Picker sync:** `pickerSyncBg`, `remPick` → SPA.
- **My Students:** `fmtBday`, `glHist` → SPA; `glHist` synthesises lifegroup history in the demo — in the real app this maps to backend-provided lifegroup data, so decide per-change (likely a real endpoint/field rather than client synthesis).
- **Viewport/misc:** `onViewportChange`, `syncToggle`, `tLvF` → SPA.
- **Removed:** `toggleHomeGradeBreakdown` (old "Grade detail" dropdown) → remove the equivalent from the SPA if present.

For each item: read the canonical demo's implementation, decide SPA-only vs SPA+backend, implement, and check off against the CLAUDE.md pattern list.

### Phase 4 — Docs
- `youth-allocation-platform/CLAUDE.md`: update the "Canonical demo location" banner and "Frontend files" table to point at `youth app demo/allocation-platform.html`; drop references to the removed local `demo-site/`.
- `Camp Platform/CLAUDE.md`: update "Frontend files" / deploy notes — `demo-site/` no longer lives here; deploy is now CLI from `youth app demo/`.
- Project-4 `CLAUDE.md`: update the live-demo + canonical-file sections to the new folder and CLI deploy flow.
- `MEMORY.md` entry `yc-camp-demo-deployment.md`: update deploy mechanism (CLI from `youth app demo/`, git disconnected).

## Verification

- **Demos:** `node --check` per moved HTML `<script>`; cache-busted `curl` per demo against the live URL post-deploy.
- **Real app:** `npm run typecheck` and `npm run test` in `youth-allocation-platform/` after Phase 3; manual browser smoke of `public/index.html` against `npm run dev` for the ported screens (student detail assignment, home tiles, My Students, picker).

## Risks / gotchas

- **Git-connected deploy:** until the user disconnects Git on `yc-camp-demo`, a push to `youth-camp-platform` could trigger a deploy of the demo-less repo. Order matters: do the dashboard disconnect before/at the git commit that removes `demo-site/`.
- **`.vercel` move:** the project link is a directory; moving it preserves the project association for CLI deploys. Confirm `vercel` picks it up (no re-link prompt) before the first prod deploy.
- **CRLF:** Windows working tree — commit with `git -c core.autocrlf=true`.
- **Demo persistence keys** (`yap_demo_v2`, etc.) are demo-only; not affected by the move.
- **glHist parity:** synthesised lifegroup history in the demo must not be blindly copied into the real SPA if the backend already provides real lifegroup data — this is the clearest "apply per-change where it belongs" judgement call.
```
