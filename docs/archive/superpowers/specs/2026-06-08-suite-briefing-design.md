# Design — Whole-suite executive briefing ("Your week. Your term. Your year.")

**Date:** 2026-06-08
**Scope:** `Camp Platform/demo-site/` (the static demo deployed to https://yc-camp-demo.vercel.app)

## Goal

A new executive briefing that **progressively builds up** and presents the three core tooling sets as one connected toolkit for Youth Society Brisbane, then closes with the two spin-offs as proof it extends beyond.

- **Audience:** the YS Brisbane youth pastor. Tone speaks to them about their own ministry.
- **Spine:** ministry cadence — Weekly → Each term → Each year.
- **Spin-offs:** real & working, presented briefly (coda, ~2 slides).
- **Home:** inside the existing camp demo site (`demo-site/`), one-push deploy.

## The cast (narrative mapping)

| In the briefing | Actual project | Live? |
|---|---|---|
| Cloud **allocation app** (weekly) | `youth-allocation-app` (Project 2) | youth-allocation-app.vercel.app |
| **Visibility tool** (each term, SWOT) | Project 3 single-file HTML | offline, no host |
| **Camp tool** (each year) | Camp Platform (Project 4) | yc-camp-demo.vercel.app (this site) |
| Spin-off ① Cloud **youth ministry app** | `youth-ministry-app` (Project 2) | youth-ministry-app.vercel.app |
| Spin-off ② **HTML insights** | Project 1 single-file HTML | offline, no host |

**Narrative note:** the briefing presents the allocation app as the parent that spawned the two spin-offs. Actual git lineage is the reverse (allocation forked from the ministry app; HTML insights was the original). This is a deliberate storytelling choice, not an error.

## Format

Approach A — **swipe-deck reusing the camp `exec-presentation.html` chrome** (progress bar, prev/next arrows, dots, keyboard + swipe + edge-tap nav). Self-contained static HTML/CSS/JS, offline-capable.

**Signature motif — the "rhythm rail":** a 3-stop rail (Weekly · Each term · Each year) introduced on slide 2 with all stops dim. Each act lights its own stop as it is presented, so the toolkit visibly accumulates. The convergence slide shows the rail fully lit.

## Slide arc (~12)

1. **Title** — "Your week. Your term. Your year." · Youth Society Brisbane · one connected toolkit. (dark)
2. **The rhythm** — introduce the rail; ministry runs on three cadences. All stops dim.
3. **Act 1 need** — Weekly: who's got eyes on whom, every week?
4. **Act 1 tool — Allocation app** — allocate youth↔leaders, set leaders/grades, "My Youth", coverage gaps, at-risk surfacing, Excel export, built on live attendance analytics. Deployed (Supabase Sydney). Rail: Weekly lights.
5. **Act 2 need** — Each term: step back — where are we actually tracking? (SWOT)
6. **Act 2 tool — Visibility tool** — drop in 5 CSV exports → 5-rung integration ladder → Rising/Declining Connection → one-tap "Build Presentation" executive deck. Offline single file. Rail: Each term lights.
7. **Act 3 need** — Each year: the ~1,000-student annual camp.
8. **Act 3 tool — Camp tool** — one app, two modes (pre-camp/at-camp), one record, safeguarding sign-out, phone-first. Condensed from the camp deck. Rail: Each year lights.
9. **Convergence** — full lit rail: three cadences, one toolkit, one ministry.
10. **Reach intro / spin-off ①** — "and it already extends beyond us": Cloud youth ministry app — the allocation app's simpler sibling, shareable with other youth ministries. Deployed.
11. **Spin-off ②** — HTML insights — generalised single-file version for other demographics (young adults / other locations). Same engine, new audiences.
12. **Close** — "Built, working, and yours." Quick links: allocation app + ministry app + camp (relative `camp-platform.html`). The two offline tools are described, not linked.

## Launchpad changes (`demo-site/index.html`)

- Repoint the existing top "Executive briefing" card → `suite-briefing.html`, relabel to convey the full toolkit (week / term / year), keep "Start here".
- Add a smaller secondary "Camp briefing" link/card → the existing `exec-presentation.html` (camp-only deck), so it stays reachable.
- Keep the Camp Platform and Training cards as-is. Light touch on the page lead so it isn't camp-exclusive.

## Constraints / non-goals

- Pure static, self-contained, offline-capable. No backend, no build step. Reuse camp deck CSS idioms.
- Projects 5 (Python reports) and 6 (Nursing) are out of scope.
- Don't rewrite the camp `exec-presentation.html`; only relabel its launchpad entry.

## Ship

Edit → syntax-check the deck's `<script>` with `node --check` → commit with `git -c core.autocrlf=true` → `git push origin master` (auto-deploys) → verify live with a cache-busted request.
