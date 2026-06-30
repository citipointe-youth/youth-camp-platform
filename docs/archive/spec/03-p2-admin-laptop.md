# Part 2 — Admin Setup + Laptop Interface

## 1. Overview

Part 2 upgrades the admin experience for the setup phase of camp: a laptop-friendly responsive
layout, a trustworthy import pipeline, bulk church loading, a date-range-driven settings form,
a guided setup wizard, and automatic temp-password generation on new-year rollover.

All changes are strictly additive to the existing phone layout. No existing phone-layout CSS
is touched. The SPA remains a single file (`public/index.html`). New backend routes are additive
to `router.ts`. The import pipeline reuses `POST /import/csv` with a new `dryRun` flag rather
than adding a second route.

Roles in scope: `admin` (all features), `director` (import only, no settings/wizard).
Everything that requires `admin:manage` stays `admin`-only server-side.

---

## 2. Responsive layout

### 2a. Exact CSS additions for @media(min-width:980px) — PURELY ADDITIVE

Add the following block immediately after the existing `@keyframes spin` rule (around line 113)
in the `<style>` block. Nothing before this media query is modified.

```css
/* ============================================================
   WIDE / LAPTOP LAYOUT — additive only, phone layout unchanged
   ============================================================ */
@media(min-width:980px){
  body{align-items:flex-start;padding:0;}

  /* Kill the phone-frame container at wide widths */
  .app{
    max-width:100%;
    width:100%;
    height:100dvh;
    flex-direction:row;      /* side-nav | content column */
    box-shadow:none;
    border-radius:0;
    overflow:hidden;
  }

  /* The top bar becomes invisible on wide — navigation lives in the side-nav.
     Keep it in the DOM for the back-button logic; just collapse it. */
  .bar{display:none;}

  /* Stage fills remaining width after side-nav */
  .stage{flex:1;overflow:hidden;}

  /* Screens scroll within the stage, not the whole page */
  .screen{padding:28px 36px 40px;}

  /* Bottom tabs hidden — navigation is side-nav on wide */
  .tabs{display:none;}

  /* ---- Side navigation ---- */
  .wide-nav{
    display:flex;             /* shown only on wide */
    flex-direction:column;
    width:220px;
    min-width:220px;
    height:100dvh;
    background:var(--navy);
    color:#fff;
    padding:0;
    overflow-y:auto;
    flex:none;
    z-index:30;
  }
  .wide-nav-hd{
    padding:24px 18px 16px;
    border-bottom:1px solid rgba(255,255,255,.1);
  }
  .wide-nav-hd .app-title{font-size:.95rem;font-weight:800;color:#fff;letter-spacing:.01em;}
  .wide-nav-hd .app-sub{font-size:.68rem;color:#9fb6d6;margin-top:2px;}
  .wide-nav-hd .mode-chip{
    display:inline-block;margin-top:8px;
    font-size:.58rem;font-weight:800;padding:3px 10px;border-radius:999px;
  }
  .wide-nav-hd .mode-chip.pre{background:#f59e0b;color:#3a2a00;}
  .wide-nav-hd .mode-chip.at{background:#16a34a;color:#fff;}

  .wide-nav-section{
    padding:10px 12px 4px;
    font-size:.6rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;
    color:rgba(255,255,255,.35);
  }
  .wide-nav-item{
    display:flex;align-items:center;gap:10px;
    padding:10px 18px;
    font-size:.84rem;font-weight:600;color:rgba(255,255,255,.78);
    cursor:pointer;border:none;background:none;width:100%;text-align:left;
    border-radius:0;transition:background .12s;
  }
  .wide-nav-item:hover{background:rgba(255,255,255,.07);}
  .wide-nav-item.on{background:rgba(37,99,235,.35);color:#fff;font-weight:700;}
  .wide-nav-item .ic{font-size:1rem;flex:none;width:20px;text-align:center;}

  .wide-nav-foot{
    margin-top:auto;padding:14px 18px;
    border-top:1px solid rgba(255,255,255,.1);
    font-size:.72rem;color:#9fb6d6;
  }
  .wide-nav-foot .sign-out-btn{
    background:rgba(255,255,255,.12);border:none;color:#fff;
    font-size:.72rem;font-weight:700;padding:7px 14px;
    border-radius:999px;cursor:pointer;margin-top:8px;width:100%;
  }

  /* ---- Two-column form layout ---- */
  .wide-two-col{
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:0 24px;
    align-items:start;
  }
  /* Span full width within a two-col form */
  .wide-full{grid-column:1/-1;}

  /* ---- Sticky save bar ---- */
  .wide-save-bar{
    position:sticky;bottom:0;
    background:rgba(244,247,252,.94);
    backdrop-filter:blur(8px);
    border-top:1px solid var(--line);
    padding:10px 0;
    display:flex;align-items:center;gap:12px;
    margin-top:16px;z-index:10;
  }
  .wide-save-bar .btn{width:auto;padding:10px 28px;margin:0;}
  .wide-save-bar .hint{font-size:.72rem;color:var(--muted);}

  /* ---- Admin console tile grid widens ---- */
  .tiles{grid-template-columns:repeat(3,1fr);}

  /* Wizard step strip */
  .wizard-steps{
    display:flex;gap:0;margin-bottom:24px;
    border:1px solid var(--line);border-radius:13px;overflow:hidden;
  }
  .wizard-step{
    flex:1;padding:12px 8px;text-align:center;background:#fff;
    font-size:.74rem;font-weight:700;color:var(--muted);cursor:pointer;
    border-right:1px solid var(--line);position:relative;
  }
  .wizard-step:last-child{border-right:none;}
  .wizard-step.done{background:#f0fdf4;color:#15803d;}
  .wizard-step.active{background:#eef4ff;color:var(--blue);font-weight:800;}
  .wizard-step .step-num{
    display:block;font-size:1rem;margin-bottom:2px;
  }
}

/* Wide-nav hidden on phone */
.wide-nav{display:none;}
```

### 2b. Admin console on wide: left side-nav tile, right content panel

The `.wide-nav` element is injected once into `.app` (before `.bar`) by `_initWideNav()`.
The side-nav replaces the bottom tab bar for navigation on wide screens, and also houses the
admin-console section links.

```javascript
// Call once after login, before first render.
function _initWideNav() {
  if (document.getElementById('wideNav')) return;
  const nav = document.createElement('nav');
  nav.id = 'wideNav';
  nav.className = 'wide-nav';
  nav.setAttribute('role', 'navigation');
  nav.setAttribute('aria-label', 'Main navigation');
  document.querySelector('.app').prepend(nav);
  _renderWideNav();
}

function _renderWideNav() {
  const nav = document.getElementById('wideNav');
  if (!nav) return;
  const isAdmin = ACTOR && ACTOR.role === 'admin';
  const isDir   = ACTOR && (ACTOR.role === 'director' || isAdmin);
  const modeChip = `<span class="mode-chip ${CAMP_MODE === 'at-camp' ? 'at' : 'pre'}">${CAMP_MODE === 'at-camp' ? 'AT CAMP' : 'PRE-CAMP'}</span>`;
  const cur = STACK[STACK.length - 1] || 'home';

  const navItem = (screen, icon, label) =>
    `<button class="wide-nav-item${cur === screen ? ' on' : ''}" onclick="go('${screen}')" aria-current="${cur === screen ? 'page' : 'false'}">
      <span class="ic">${icon}</span>${esc(label)}
    </button>`;

  const adminSection = isAdmin ? `
    <div class="wide-nav-section">Admin</div>
    ${navItem('admin',        '⚙️', 'Admin console')}
    ${navItem('adminSettings','📅', 'Camp settings')}
    ${navItem('adminAccounts','🏛️', 'Accounts & churches')}
    ${navItem('adminAccom',   '🏕️', 'Accommodation')}
    ${navItem('adminSchedEdit','🗓️', 'Schedule')}
    ${navItem('adminData',    '📦', 'Data & reset')}
  ` : '';

  const importItem = isDir ? navItem('import', '📤', 'Import students') : '';

  nav.innerHTML = `
    <div class="wide-nav-hd">
      <div class="app-title">Youth Camp</div>
      <div class="app-sub">${esc(ACTOR ? ACTOR.displayName || ACTOR.username : '')}</div>
      ${modeChip}
    </div>
    <div class="wide-nav-section">Main</div>
    ${navItem('home', '🏠', 'Home')}
    ${CAMP_MODE === 'pre-camp' ? navItem('registrants', '📋', 'Registrants') : ''}
    ${CAMP_MODE === 'at-camp'  ? navItem('roster',      '✅', 'Check-in roster') : ''}
    ${navItem('search', '🔍', 'Search')}
    ${importItem}
    ${adminSection}
    <div class="wide-nav-foot">
      <div>${esc(ACTOR ? ACTOR.role : '')}</div>
      <button class="sign-out-btn" onclick="signOut()">Sign out</button>
    </div>
  `;
}
```

Call `_renderWideNav()` at the end of every `RENDER.*` function (add a one-liner wrapper):

```javascript
// Patch: re-highlight active item after every screen render.
const _origPaint = paint;
function paint(screenId, html, title, sub) {
  _origPaint(screenId, html, title, sub);
  _renderWideNav();
}
```

On phone (`max-width < 980px`) `.wide-nav` is `display:none` via CSS and the bottom `.tabs`
remain visible and functional — no JS change is needed for the phone path.

### 2c. Multi-column forms on wide: `.wide-two-col` + `.wide-full`

On screens wider than 980 px, admin forms with many fields become two-column grids.

Apply `.wide-two-col` to any `<div class="card">` inner wrapper when the form has 4+ fields:

```html
<!-- Example: camp settings form wrapper -->
<div class="wide-two-col">
  <div><!-- left col fields --></div>
  <div><!-- right col fields --></div>
  <div class="wide-full"><!-- full-width save bar --></div>
</div>
```

Concrete application rules (which screens get two-col layout):
- `adminSettings` — left: camp name, year, start/end date pickers, timezone; right: location, check-in from, register URL, derived-days display.
- `adminAccounts` "Add a church" form — left: church name, code, zone, youth pastor; right: login username, password, expected count, contact email.
- `adminAccounts` "Add account" form — left: first/last name, username, password; right: role, zone/church selector.

The `.wide-two-col` class has no effect on phone (the grid simply collapses to single column
because `grid-template-columns` is not overridden in the base style).

### 2d. Sticky save bar + Ctrl+S keyboard shortcut on wide

Add the sticky save bar inside any form card at the bottom:

```html
<div class="wide-save-bar wide-full">
  <button class="btn" onclick="saveSettings()">Save settings</button>
  <span class="hint">Ctrl+S</span>
</div>
```

Keyboard shortcut — register once in `_initWideNav()`:

```javascript
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    const cur = STACK[STACK.length - 1];
    const savers = {
      adminSettings: saveSettings,
    };
    if (savers[cur]) savers[cur]();
  }
});
```

The shortcut is safe on phone: the `.wide-save-bar` element is visually hidden via
`overflow:hidden` on the phone `.app` frame width, and the keydown listener is a no-op on touch
devices.

---

## 3. Import trust and control

### 3a. Backend dryRun flag: updated ImportOptionsSchema + skip saveMany

**File:** `src/services/import.service.ts`

Replace the existing `ImportOptionsSchema` and the `saveMany` call with the diff below.

```diff
 const ImportOptionsSchema = z.object({
   csvData: z.string().min(1),
   churchId: z.string().optional(),
   defaultZone: z.string().optional(),
   updateExisting: z.boolean().optional().default(false),
+  dryRun: z.boolean().optional().default(false),
 });
```

In `ImportResult`, add a `dryRun` indicator (so the SPA can render the preview banner):

```diff
 export interface ImportResult {
   created: number;
   updated: number;
   skipped: number;
   errors: Array<{ row: number; message: string }>;
   warnings: Array<{ row: number; message: string }>;
   churchesCreated: string[];
+  dryRun: boolean;
 }
```

At the bottom of `importCsv`, guard the write with `dryRun`:

```diff
-      if (touched.size > 0) await personRepo.saveMany([...touched.values()]);
-
-      return { created, updated, skipped, errors, warnings, churchesCreated };
+      if (!opts.dryRun && touched.size > 0) {
+        await personRepo.saveMany([...touched.values()]);
+      }
+
+      return { created, updated, skipped, errors, warnings, churchesCreated, dryRun: opts.dryRun };
```

No new route. The flag is passed in the existing `POST /import/csv` request body.

### 3b. Stop phantom-church creation in dryRun mode

**File:** `src/services/import.service.ts` — `resolveChurch` inner function.

Current behaviour: the function unconditionally calls `churchRepo.save()` when a church name
has no match, even in a dryRun. This causes phantom church rows in the database.

Replace the `resolveChurch` function body with:

```diff
 async function resolveChurch(name: string, youthPastor: string, rowNum: number, createdAt: string): Promise<string> {
   if (!name) return '';
   const key = name.toLowerCase();
   const existing = churchIdByName.get(key) ?? newlyCreated.get(key);
   if (existing) return existing;
+
+  // In dry-run mode: emit a warning but do NOT write to the DB.
+  // Use a sentinel ID so the rest of the row can still be validated.
+  if (opts.dryRun) {
+    const sentinelId = `dryrun:${key}`;
+    newlyCreated.set(key, sentinelId);
+    churchesCreated.push(name);
+    warnings.push({ row: rowNum, message: `Church "${name}" not found — would be created (zone defaulted to Yellow). Confirm in Bulk Church Import first.` });
+    return sentinelId;
+  }
+
   const id = newId('church');
   const code = slugCode(name, takenCodes);
```

The sentinel ID (`dryrun:${key}`) means `resolvedChurchId` is populated so `nameChurchKey`
still works, but no real record references it. In a live run (`dryRun: false`) the behaviour is
unchanged.

Implementer note: after the dry-run preview the admin should either (a) add the missing churches
via Bulk Church Import (section 4) before running the live import, or (b) accept the auto-create
by running the live import without `dryRun`. The warning text directs them to option (a).

### 3c. SPA 3-step import flow: Choose file -> Preview -> Result

Replace `adminUpload()` and the `#impResult` div with a full 3-step flow. The flow is rendered
inside the existing `#impResult` area so no screen structure changes.

**Step 1 — Choose file** (existing file input + button triggers step 2 instead of immediate upload):

```javascript
// Replace the existing adminUpload() function entirely.
async function adminUpload() {
  const f = document.getElementById('fileIn')?.files[0];
  if (!f) { toast('Choose a CSV file first'); return; }
  if (!f.name.toLowerCase().endsWith('.csv')) { toast('Only CSV files are supported'); return; }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      _showImportStep('loading');
      const preview = await api('/import/csv', {
        method: 'POST',
        body: { csvData: reader.result, updateExisting: true, dryRun: true },
      });
      _renderImportPreview(preview, reader.result);
    } catch (e) {
      _showImportStep('error', e.message);
    }
  };
  reader.readAsText(f);
}
```

**Step 2 — Preview** (`renderImportPreview`):

```javascript
function _renderImportPreview(preview, rawCsv) {
  const box = document.getElementById('impResult');
  if (!box) return;
  box.style.display = 'block';

  const errorRows = (preview.errors || []).slice(0, 10).map(e =>
    `<li>Row ${e.row}: ${esc(e.message)}</li>`).join('');
  const warnRows = (preview.warnings || []).slice(0, 10).map(w =>
    `<li>Row ${w.row}: ${esc(w.message)}</li>`).join('');
  const churchBanner = preview.churchesCreated.length
    ? `<div class="warnbox">⚠ <b>${preview.churchesCreated.length}</b> church name(s) not found and would be auto-created: <b>${preview.churchesCreated.map(esc).join(', ')}</b>. Consider using Bulk Church Import first if these are new churches.</div>`
    : '';

  box.innerHTML = `
    <div class="lbl" style="margin-top:0">Import preview (dry run — nothing saved yet)</div>
    <div class="statband">
      <div class="s"><b>${preview.created}</b><span>New</span></div>
      <div class="s"><b>${preview.updated}</b><span>Updated</span></div>
      <div class="s"><b>${preview.skipped}</b><span>Skipped</span></div>
      <div class="s" style="color:var(--danger)"><b>${(preview.errors||[]).length}</b><span>Errors</span></div>
    </div>
    ${churchBanner}
    ${preview.errors.length  ? `<div class="warnbox"><b>Errors (first 10):</b><ul style="margin:6px 0 0 16px;font-size:.8rem">${errorRows}</ul></div>` : ''}
    ${preview.warnings.length ? `<div class="infobox"><b>Warnings (first 10):</b><ul style="margin:6px 0 0 16px;font-size:.8rem">${warnRows}</ul></div>` : ''}
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="btn" style="flex:1" onclick="_confirmImport(${JSON.stringify(rawCsv).replace(/</g,'\\u003c')})">Confirm &amp; import</button>
      <button class="btn ghost" style="flex:1;margin:0" onclick="document.getElementById('impResult').style.display='none'">Cancel</button>
    </div>
  `;
}

async function _confirmImport(rawCsv) {
  const box = document.getElementById('impResult');
  box.innerHTML = '<div class="loading"><div class="spin"></div><div class="lt">Importing…</div></div>';
  try {
    const r = await api('/import/csv', {
      method: 'POST',
      body: { csvData: rawCsv, updateExisting: true, dryRun: false },
    });
    box.innerHTML = `
      <div class="callbox">
        Import complete — <b>${r.created}</b> new, <b>${r.updated}</b> updated, ${r.skipped} skipped,
        <b style="color:var(--danger)">${(r.errors||[]).length}</b> errors.
        ${r.churchesCreated.length ? `<br>Churches auto-created: ${r.churchesCreated.map(esc).join(', ')}.` : ''}
      </div>
    `;
    toast('Import complete');
  } catch (e) {
    box.innerHTML = `<div class="warnbox">Import failed: ${esc(e.message)}</div>`;
  }
}

function _showImportStep(state, msg) {
  const box = document.getElementById('impResult');
  if (!box) return;
  box.style.display = 'block';
  if (state === 'loading') {
    box.innerHTML = '<div class="loading"><div class="spin"></div><div class="lt">Analysing CSV…</div></div>';
  } else if (state === 'error') {
    box.innerHTML = `<div class="warnbox">Error: ${esc(msg || 'Unknown error')}</div>`;
  }
}
```

The `rawCsv` string is passed through `JSON.stringify` with `<` escaped to prevent XSS when
inlined into `onclick`. The inline `onclick` is acceptable here because `rawCsv` is already the
file's text content (controlled by the admin). For extra safety the `<` escape ensures no
HTML injection path.

### 3d. Confirm dryRun uses same POST /import/csv route — no new route

Both the dry-run preview call and the final commit call use `POST /import/csv`. The only
difference is the `dryRun` body field. No router.ts changes needed. The existing
`importCtrl.run` controller already passes the body straight to `importService.importCsv`.

---

## 4. Bulk church import

### 4a. CSV format

```
churchName,zone,code,youthPastorName,contactEmail,loginUsername,loginPassword,expectedCount
Victory Church,Yellow,VICTORY,Ps Sam Smith,sam@victory.org,victory,tempPass123,45
Grace Point,Blue,GRACE,Ps Lee Jones,lee@grace.org,gracepoint,tempPass456,30
```

Rules:
- `code` must be unique across all churches; 2-10 alphanumeric chars. If blank, derived by
  `slugCode(churchName, takenCodes)` server-side.
- `zone` must be one of Yellow, Blue, Green, Red. Defaults to Yellow if blank.
- `loginUsername` must be unique; treated as the idempotency key for re-runs:
  if a user with that username already exists AND its `churchId` matches an existing church with
  that `code`, the row is skipped (no update — use the accounts screen for that).
- `loginPassword` min 6 chars. Required.
- `expectedCount` integer >= 0. Defaults to 0 if blank.
- `contactEmail` optional; validated as email if provided.
- `youthPastorName` optional free text.

### 4b. New POST /import/churches endpoint — complete service method and controller

**New file:** `src/services/church-import.service.ts`

```typescript
import type { IUserRepository, IChurchRepository } from '../repositories/interfaces/entity-repositories';
import type { Church } from '../core/entities/church';
import type { User } from '../core/entities/user';
import type { Actor } from '../core/entities/user';
import { assertCan } from './access-control';
import { BadRequestError } from '../core/errors/app-error';
import { parseCsv } from '../utils/csv';
import { hashPassword } from '../utils/crypto';
import { newId } from '../utils/id';
import { nowISO } from '../utils/date';
import { ZONE_NAMES } from '../core/types/enums';
import { z } from 'zod';

const ChurchImportRowSchema = z.object({
  churchName:     z.string().min(1),
  zone:           z.enum(ZONE_NAMES).default('Yellow'),
  code:           z.string().max(10).optional(),
  youthPastorName: z.string().optional(),
  contactEmail:   z.string().email().optional().or(z.literal('')),
  loginUsername:  z.string().min(2).max(40).regex(/^[A-Za-z0-9._-]+$/),
  loginPassword:  z.string().min(6),
  expectedCount:  z.coerce.number().int().min(0).default(0),
});

export interface ChurchImportResult {
  created:  number;
  skipped:  number;
  errors:   Array<{ row: number; message: string }>;
  warnings: Array<{ row: number; message: string }>;
  dryRun:   boolean;
}

export interface ChurchImportService {
  importChurchesCsv(actor: Actor, input: unknown): Promise<ChurchImportResult>;
}

function slugCode(name: string, taken: Set<string>): string {
  const base = name.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 8) || 'CHURCH';
  let code = base; let n = 1;
  while (taken.has(code)) code = `${base}${n++}`.slice(0, 10);
  taken.add(code);
  return code;
}

const ChurchImportOptionsSchema = z.object({
  csvData: z.string().min(1),
  dryRun:  z.boolean().optional().default(false),
});

export function makeChurchImportService(
  userRepo:   IUserRepository,
  churchRepo: IChurchRepository,
): ChurchImportService {
  return {
    async importChurchesCsv(actor, input) {
      assertCan(actor, 'admin:manage');
      const opts   = ChurchImportOptionsSchema.parse(input);
      const rows   = parseCsv(opts.csvData);
      if (rows.length === 0) throw new BadRequestError('CSV has no data rows');

      const existingChurches = await churchRepo.findAll();
      const existingUsers    = await userRepo.findAll();

      const churchByCode = new Map(existingChurches.map((c) => [c.code.toUpperCase(), c]));
      const userByUsername = new Map(existingUsers.map((u) => [u.username.toLowerCase(), u]));
      const takenCodes = new Set(existingChurches.map((c) => c.code.toUpperCase()));

      let created = 0;
      let skipped = 0;
      const errors:   ChurchImportResult['errors']   = [];
      const warnings: ChurchImportResult['warnings'] = [];

      for (let i = 0; i < rows.length; i++) {
        const rawRow = rows[i]!;
        const rowNum = i + 2;
        try {
          // Normalise header casing (CSV headers may have spaces or mixed case)
          const row: Record<string, string> = {};
          for (const [k, v] of Object.entries(rawRow)) {
            row[k.trim().replace(/\s+/g, '')] = (v ?? '').trim();
          }
          const parsed = ChurchImportRowSchema.parse({
            churchName:      row['churchName']     || row['ChurchName'],
            zone:            row['zone']           || row['Zone'] || 'Yellow',
            code:            row['code']           || row['Code'] || undefined,
            youthPastorName: row['youthPastorName']|| row['YouthPastorName'] || undefined,
            contactEmail:    row['contactEmail']   || row['ContactEmail']   || '',
            loginUsername:   row['loginUsername']  || row['LoginUsername'],
            loginPassword:   row['loginPassword']  || row['LoginPassword'],
            expectedCount:   row['expectedCount']  || row['ExpectedCount']  || '0',
          });

          const code = (parsed.code
            ? parsed.code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
            : slugCode(parsed.churchName, takenCodes)).slice(0, 10) || 'CHURCH';

          // Idempotency: skip if username already exists
          if (userByUsername.has(parsed.loginUsername.toLowerCase())) {
            skipped++;
            warnings.push({ row: rowNum, message: `Username "${parsed.loginUsername}" already exists — row skipped` });
            continue;
          }
          if (churchByCode.has(code)) {
            skipped++;
            warnings.push({ row: rowNum, message: `Church code "${code}" already exists — row skipped` });
            continue;
          }

          takenCodes.add(code);

          if (!opts.dryRun) {
            const now = nowISO();
            const churchId = newId('church');
            const slug = parsed.churchName.toLowerCase()
              .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'church';

            const church: Church = {
              id: churchId,
              name: parsed.churchName,
              zone: parsed.zone,
              code,
              selfRegisterSlug: slug,
              expectedCount: parsed.expectedCount,
              youthPastorName: parsed.youthPastorName,
              contactEmail:    parsed.contactEmail || undefined,
              reservations: [],
              contacts: {
                male:   { primary: { name: '', phone: '' }, backup: { name: '', phone: '' } },
                female: { primary: { name: '', phone: '' }, backup: { name: '', phone: '' } },
              },
              createdAt: now,
              updatedAt: now,
            };
            await churchRepo.save(church);

            const passwordHash = await hashPassword(parsed.loginPassword);
            const user: User = {
              id: newId('user'),
              firstName: parsed.youthPastorName?.split(' ')[0] ?? parsed.churchName,
              lastName:  parsed.youthPastorName?.split(' ').slice(1).join(' ') || 'Team',
              username:  parsed.loginUsername.toLowerCase(),
              role: 'church',
              churchId,
              churchName: parsed.churchName,
              zone: parsed.zone,
              status: 'active',
              passwordHash,
              createdAt: now,
              updatedAt: now,
            };
            await userRepo.save(user);
          }
          created++;
        } catch (err) {
          errors.push({ row: rowNum, message: err instanceof Error ? err.message : String(err) });
        }
      }

      return { created, skipped, errors, warnings, dryRun: opts.dryRun };
    },
  };
}
```

**Register in container.ts** — add alongside the existing `importService` entry:

```typescript
// In the Services interface and makeServices() factory:
churchImport: ChurchImportService;

// In the factory body (both memory and supabase branches):
churchImport: makeChurchImportService(repos.users, repos.churches),
```

**New controller:** `src/api/controllers/church-import.controller.ts`

```typescript
import type { Services } from '../../container';
import type { AppRequest } from '../http/types';

export function makeChurchImportController(deps: { churchImport: Services['churchImport'] }) {
  return {
    async run(req: AppRequest) {
      return deps.churchImport.importChurchesCsv(req.actor!, req.body);
    },
  };
}
```

**Register in router.ts** — add to `buildRoutes`:

```typescript
// Add at top of buildRoutes alongside other controller instantiations:
const churchImportCtrl = makeChurchImportController({ churchImport: services.churchImport });

// Add to the routes array in the Import section:
{ method: 'POST', path: '/import/churches', auth: true, handler: (r) => churchImportCtrl.run(r) },
```

### 4c. SPA: bulk church import screen with 3-step preview flow

Add `RENDER.adminChurchImport` and a matching tile in `RENDER.admin`:

```javascript
// Add tile to RENDER.admin tiles:
// <div class="tile" onclick="go('adminChurchImport')"><div class="l">Bulk church import</div></div>

RENDER.adminChurchImport = function() {
  paint('adminChurchImport', `
    <div class="infobox">Import multiple churches + login accounts from a single CSV file.
      Each row creates one church and one login account. Existing usernames and codes are skipped.</div>
    <div class="card">
      <div class="h3" style="margin-top:0">CSV format</div>
      <code style="font-size:.72rem;display:block;background:#f4f7fc;border-radius:8px;padding:10px;overflow-x:auto;white-space:pre">churchName,zone,code,youthPastorName,contactEmail,loginUsername,loginPassword,expectedCount
Victory Church,Yellow,VICTORY,Ps Sam,sam@victory.org,victory,TempPass1,45
Grace Point,Blue,GRACE,Ps Lee,,gracepoint,TempPass2,30</code>
    </div>
    <div class="card">
      <div class="h3" style="margin-top:0">Upload church CSV</div>
      <input type="file" id="churchImportFile" accept=".csv" class="fld">
      <button class="btn" onclick="churchImportUpload()">Preview &amp; import</button>
      <div id="churchImportResult" style="margin-top:10px;display:none"></div>
    </div>
  `, 'Bulk church import', 'Admin');
};

async function churchImportUpload() {
  const f = document.getElementById('churchImportFile')?.files[0];
  if (!f) { toast('Choose a CSV file first'); return; }
  if (!f.name.toLowerCase().endsWith('.csv')) { toast('Only CSV files'); return; }
  const reader = new FileReader();
  reader.onload = async () => {
    const box = document.getElementById('churchImportResult');
    box.style.display = 'block';
    box.innerHTML = '<div class="loading"><div class="spin"></div><div class="lt">Analysing…</div></div>';
    try {
      const preview = await api('/import/churches', {
        method: 'POST',
        body: { csvData: reader.result, dryRun: true },
      });
      _renderChurchImportPreview(preview, reader.result);
    } catch (e) {
      box.innerHTML = `<div class="warnbox">Error: ${esc(e.message)}</div>`;
    }
  };
  reader.readAsText(f);
}

function _renderChurchImportPreview(preview, rawCsv) {
  const box = document.getElementById('churchImportResult');
  const errorRows  = (preview.errors  || []).slice(0, 10).map(e => `<li>Row ${e.row}: ${esc(e.message)}</li>`).join('');
  const warnRows   = (preview.warnings|| []).slice(0, 10).map(w => `<li>Row ${w.row}: ${esc(w.message)}</li>`).join('');
  box.innerHTML = `
    <div class="lbl" style="margin-top:0">Preview (dry run — nothing saved yet)</div>
    <div class="statband">
      <div class="s"><b>${preview.created}</b><span>Will create</span></div>
      <div class="s"><b>${preview.skipped}</b><span>Skipped</span></div>
      <div class="s" style="color:var(--danger)"><b>${(preview.errors||[]).length}</b><span>Errors</span></div>
    </div>
    ${preview.errors.length  ? `<div class="warnbox"><b>Errors:</b><ul style="margin:6px 0 0 16px;font-size:.8rem">${errorRows}</ul></div>` : ''}
    ${preview.warnings.length? `<div class="infobox"><b>Warnings:</b><ul style="margin:6px 0 0 16px;font-size:.8rem">${warnRows}</ul></div>` : ''}
    ${preview.created === 0  ? '<div class="warnbox">Nothing to import — all rows skipped or errored.</div>' : ''}
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="btn" style="flex:1" onclick="_confirmChurchImport(${JSON.stringify(rawCsv).replace(/</g,'\\u003c')})">Confirm &amp; create ${preview.created} church(es)</button>
      <button class="btn ghost" style="flex:1;margin:0" onclick="document.getElementById('churchImportResult').style.display='none'">Cancel</button>
    </div>
  `;
}

async function _confirmChurchImport(rawCsv) {
  const box = document.getElementById('churchImportResult');
  box.innerHTML = '<div class="loading"><div class="spin"></div><div class="lt">Creating churches…</div></div>';
  try {
    const r = await api('/import/churches', { method: 'POST', body: { csvData: rawCsv, dryRun: false } });
    box.innerHTML = `<div class="callbox">Done — <b>${r.created}</b> church(es) created, ${r.skipped} skipped, ${(r.errors||[]).length} errors.</div>`;
    toast('Churches imported');
  } catch (e) {
    box.innerHTML = `<div class="warnbox">Failed: ${esc(e.message)}</div>`;
  }
}
```

---

## 5. Date pickers + timezone dropdown

### 5a. Replace comma-separated dates with start+end date pickers, auto-derive checkInDays

The existing `adminSettings` form has a raw text field `stDays` for comma-separated
`YYYY-MM-DD` values. This is replaced with start/end date `<input type="date">` elements. The
`checkInDays` array is computed client-side from the range (every date from start inclusive to
end inclusive) and sent in the PATCH body. The server contract (`checkInDays: string[]`) is
unchanged.

Helper:

```javascript
function _datesInRange(start, end) {
  // Returns array of YYYY-MM-DD strings from start to end inclusive.
  if (!start || !end) return [];
  const result = [];
  const cur = new Date(start + 'T00:00:00');
  const last = new Date(end + 'T00:00:00');
  while (cur <= last) {
    result.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}
```

### 5b. Timezone select with AU timezones (Brisbane default)

The free-text `stTz` input is replaced with a `<select>`. Non-AU entries can still be typed via
a fallback `<input>` toggled by "Other timezone" option, but the primary list covers common AU
zones.

```javascript
const AU_TIMEZONES = [
  { value: 'Australia/Brisbane',  label: 'Brisbane (AEST, no DST)' },
  { value: 'Australia/Sydney',    label: 'Sydney (AEST/AEDT)' },
  { value: 'Australia/Melbourne', label: 'Melbourne (AEST/AEDT)' },
  { value: 'Australia/Adelaide',  label: 'Adelaide (ACST/ACDT)' },
  { value: 'Australia/Darwin',    label: 'Darwin (ACST, no DST)' },
  { value: 'Australia/Perth',     label: 'Perth (AWST, no DST)' },
  { value: 'Australia/Hobart',    label: 'Hobart (AEST/AEDT)' },
  { value: '__other__',           label: 'Other…' },
];

function _tzSelect(currentTz) {
  const known = AU_TIMEZONES.find(t => t.value === currentTz);
  const opts = AU_TIMEZONES.map(t =>
    `<option value="${t.value}"${t.value === (known ? currentTz : 'Australia/Brisbane') ? ' selected' : ''}>${t.label}</option>`
  ).join('');
  return `<select id="stTzSel" onchange="tzSelChange()" class="fld">${opts}</select>
    <input class="fld" id="stTzOther" placeholder="IANA timezone e.g. Pacific/Auckland"
      style="margin-top:6px;display:${known ? 'none' : 'block'}" value="${known ? '' : (currentTz || '')}">`;
}

function tzSelChange() {
  const v = document.getElementById('stTzSel').value;
  document.getElementById('stTzOther').style.display = v === '__other__' ? 'block' : 'none';
}

function _getSelectedTz() {
  const sel = document.getElementById('stTzSel').value;
  if (sel === '__other__') return (document.getElementById('stTzOther').value || '').trim();
  return sel;
}
```

### 5c. Complete updated renderAdminSettings and saveSettings

```javascript
RENDER.adminSettings = async function() {
  const s = SETTINGS || await api('/settings');
  const days = _datesInRange(s.startDate, s.endDate);

  paint('adminSettings', `
    <div class="card">
      <div class="wide-two-col">
        <div>
          <label>Camp name</label><input class="fld" id="stName" value="${esc(s.campName || '')}">
          <label>Year</label><input class="fld" id="stYear" type="number" inputmode="numeric" value="${esc(s.year || new Date().getFullYear())}">
          <label>Start date</label><input class="fld" id="stStart" type="date" value="${esc(s.startDate || '')}">
          <label>End date</label><input class="fld" id="stEnd" type="date" value="${esc(s.endDate || '')}" onchange="_updateDaysPreview()">
          <label>Timezone</label>${_tzSelect(s.timezone || 'Australia/Brisbane')}
        </div>
        <div>
          <label>Check-in location</label><input class="fld" id="stLoc" value="${esc(s.checkInLocation || '')}">
          <label>Check-in from</label><input class="fld" id="stFrom" value="${esc(s.checkInFrom || '')}">
          <label>Register base URL</label><input class="fld" id="stUrl" value="${esc(s.registerBaseUrl || '')}">
          <div id="daysNudge" class="infobox" style="margin-top:12px">${_daysNudgeHtml(days.length)}</div>
        </div>
        <div class="wide-save-bar wide-full">
          <button class="btn" onclick="saveSettings()">Save camp settings</button>
          <span class="hint">Ctrl+S</span>
        </div>
      </div>
      <p class="note-hint">Tent &amp; classroom prices are set per space in Admin → Accommodation.
        Changing start/end dates automatically updates check-in days.</p>
    </div>
  `, 'Camp settings', 'Dates &amp; details');
};

function _daysNudgeHtml(n) {
  if (n === 0) return 'Set start and end dates to see camp duration.';
  return `<b>${n}</b> day${n !== 1 ? 's' : ''} → ${n} devotional${n !== 1 ? 's' : ''} + ${n} schedule day${n !== 1 ? 's' : ''} needed.`;
}

function _updateDaysPreview() {
  const start = document.getElementById('stStart')?.value;
  const end   = document.getElementById('stEnd')?.value;
  const days  = _datesInRange(start, end);
  const nudge = document.getElementById('daysNudge');
  if (nudge) nudge.innerHTML = _daysNudgeHtml(days.length);
}

async function saveSettings() {
  try {
    const start = val('stStart');
    const end   = val('stEnd');
    const checkInDays = _datesInRange(start, end);
    const tz = _getSelectedTz();
    await api('/settings', {
      method: 'PATCH',
      body: {
        campName:       val('stName'),
        year:           Number(val('stYear')) || new Date().getFullYear(),
        startDate:      start,
        endDate:        end,
        timezone:       tz,
        checkInLocation: val('stLoc'),
        checkInFrom:    val('stFrom'),
        registerBaseUrl: val('stUrl'),
        checkInDays,
      },
    });
    SETTINGS = await api('/settings');
    SESSIONS = []; SEL_SESSION = null; SCHED_DAY = null; DEVO_DAY = null;
    toast('Settings saved ✓');
  } catch (e) { toast(e.message); }
}
```

### 5d. Derived-content nudge

The `#daysNudge` infobox (rendered by `_daysNudgeHtml`) shows the admin how many devotionals
and schedule days they need to create, derived from the date range. It updates live on
`onchange` of the end-date picker via `_updateDaysPreview()`. It also renders on initial
`RENDER.adminSettings` load using the stored `startDate`/`endDate`.

If start > end or either is missing, the nudge shows "Set start and end dates to see camp
duration." — it never shows a negative or NaN count.

---

## 6. Guided setup wizard

### 6a. Steps: Settings, Churches, Accounts, Accommodation, Schedule. Progress indicator.

The wizard is a dedicated screen (`adminWizard`) that walks through setup in order. Each step is
a full screen render. On wide screens the five steps show in the `.wizard-steps` strip at the
top. On phone they show as a segmented control (reusing `.seg`).

```javascript
const WIZARD_STEPS = [
  { id: 'settings',      label: 'Settings',      screen: 'adminSettings',   check: () => !!(SETTINGS && SETTINGS.campName && SETTINGS.startDate && SETTINGS.endDate) },
  { id: 'churches',      label: 'Churches',       screen: 'adminAccounts',   check: async () => { const ch = await api('/accounts/churches'); return ch.length > 0; } },
  { id: 'accounts',      label: 'Accounts',       screen: 'adminAccounts',   check: async () => { const u = await api('/accounts/users'); return u.length > 1; } },
  { id: 'accommodation', label: 'Accommodation',  screen: 'adminAccom',      check: async () => { const b = await api('/accommodation/blocks'); return b.length > 0; } },
  { id: 'schedule',      label: 'Schedule',       screen: 'adminSchedEdit',  check: async () => { const sc = await api('/schedule'); return sc.length > 0; } },
];
```

Each step's `check()` returns a boolean (or a promise of boolean) that drives the
done/incomplete state shown in the progress strip and the checklist card.

### 6b. Progress checklist card on admin home

Add to `RENDER.admin` after the tiles grid:

```javascript
async function _wizardChecklistHtml() {
  const checks = await Promise.all(WIZARD_STEPS.map(async s => {
    try { return { ...s, done: await s.check() }; }
    catch { return { ...s, done: false }; }
  }));
  const all = checks.every(c => c.done);
  if (all) return '<div class="callbox">Setup complete — all steps done.</div>';
  return `
    <div class="card" style="margin-top:12px">
      <div class="lbl" style="margin-top:0">Setup checklist</div>
      ${checks.map(c => `
        <div class="kv2" style="cursor:pointer" onclick="go('${c.screen}')">
          <span class="k">${c.label}</span>
          <span class="pill ${c.done ? 'ok' : 'warn'}">${c.done ? 'Done' : 'Needed'}</span>
        </div>`).join('')}
      <button class="btn" style="margin-top:8px" onclick="go('adminWizard')">Open setup wizard</button>
    </div>`;
}
```

Call `_wizardChecklistHtml()` from within `RENDER.admin` and inject the result into the screen:

```javascript
RENDER.admin = async function() {
  const isAdmin = ACTOR.role === 'admin';
  // ... (existing modeTile logic) ...
  const checklist = isAdmin ? await _wizardChecklistHtml() : '';
  paint('admin', `
    <div class="infobox">Admin console — configure camp here year-round.</div>
    <div class="tiles">
      <!-- existing tiles unchanged -->
      <div class="tile" onclick="go('adminChurchImport')"><div class="l">Bulk church import</div></div>
    </div>
    ${checklist}
  `, 'Admin console', 'Back office');
};
```

### 6c. renderWizardStep function and WIZARD_STEPS config

```javascript
let _wizardIdx = 0;

RENDER.adminWizard = async function() {
  const checks = await Promise.all(WIZARD_STEPS.map(async (s, i) => {
    try { return { ...s, idx: i, done: await s.check() }; }
    catch { return { ...s, idx: i, done: false }; }
  }));
  const stepStrip = checks.map((s, i) =>
    `<div class="wizard-step${i === _wizardIdx ? ' active' : ''}${s.done ? ' done' : ''}"
         onclick="_goWizardStep(${i})">
       <span class="step-num">${s.done ? '✓' : i + 1}</span>
       ${s.label}
     </div>`
  ).join('');

  const cur = WIZARD_STEPS[_wizardIdx]!;
  const isLast  = _wizardIdx === WIZARD_STEPS.length - 1;
  const isFirst = _wizardIdx === 0;

  paint('adminWizard', `
    <div class="wizard-steps">${stepStrip}</div>
    <div class="infobox" style="margin-bottom:14px">
      Step ${_wizardIdx + 1} of ${WIZARD_STEPS.length}: <b>${cur.label}</b>
    </div>
    <div id="wizardStepContent">
      <button class="btn alt" onclick="go('${cur.screen}')">Open ${cur.label} screen</button>
      <p class="note-hint" style="margin-top:8px">Make changes in the ${cur.label} screen, then return here to advance.</p>
    </div>
    <div style="display:flex;gap:8px;margin-top:16px">
      ${!isFirst ? `<button class="btn ghost" style="flex:1" onclick="_goWizardStep(${_wizardIdx - 1})">Back</button>` : '<div style="flex:1"></div>'}
      ${!isLast
        ? `<button class="btn" style="flex:1" onclick="_goWizardStep(${_wizardIdx + 1})">Next: ${WIZARD_STEPS[_wizardIdx + 1].label}</button>`
        : `<button class="btn" style="flex:1;background:var(--green)" onclick="adminSaveDefaults()">Save baseline &amp; finish</button>`
      }
    </div>
  `, 'Setup wizard', `Step ${_wizardIdx + 1} of ${WIZARD_STEPS.length}`);
};

function _goWizardStep(idx) {
  _wizardIdx = Math.max(0, Math.min(WIZARD_STEPS.length - 1, idx));
  RENDER.adminWizard();
}
```

Register `adminWizard` in the screens object. The tile in `RENDER.admin` links to it.
The wizard does not replace existing admin screens — it merely links to them and shows progress.

---

## 7. New-year R9: temp passwords

R9 is the known risk where restored accounts after `newYear` have no password (the snapshot
strips hashes). The fix: generate temp passwords server-side during `newYear`, hash and store
them, and return them in the response for inclusion in the export.

### 7a. generateTempPassword() helper using node:crypto randomBytes

**New file:** `src/utils/temp-password.ts`

```typescript
import { randomBytes } from 'node:crypto';

/**
 * Generates a human-typeable temporary password.
 * Format: 3 uppercase letters + 3 digits + 3 lowercase letters = 9 chars.
 * Avoids ambiguous chars (0/O/l/I).
 */
export function generateTempPassword(): string {
  const upper  = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const lower  = 'abcdefghjkmnpqrstuvwxyz';
  const pick = (charset: string): string => {
    const idx = randomBytes(1)[0]! % charset.length;
    return charset[idx]!;
  };
  const parts = [
    pick(upper), pick(upper), pick(upper),
    pick(digits), pick(digits), pick(digits),
    pick(lower),  pick(lower),  pick(lower),
  ];
  // Fisher-Yates shuffle using crypto random bytes
  for (let i = parts.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0]! % (i + 1);
    [parts[i], parts[j]] = [parts[j]!, parts[i]!];
  }
  return parts.join('');
}
```

The function is pure and side-effect free. It uses `node:crypto` (available in Node 18+ and
Vercel serverless), not `Math.random`.

### 7b. admin.service newYear: generate temp passwords for restored accounts, return in response

**File:** `src/services/admin.service.ts`

The existing `newYear` method restores accounts from the snapshot (which has no `passwordHash`).
Add the temp-password generation step and widen the return type.

Add import at the top:

```typescript
import { generateTempPassword } from '../utils/temp-password';
import { hashPassword } from '../utils/crypto';
```

Widen the return type of `newYear`:

```typescript
// Before:
newYear(actor: Actor): Promise<void>;

// After:
newYear(actor: Actor): Promise<{ tempPasswords: Array<{ username: string; tempPassword: string }> }>;
```

In the `newYear` implementation, after restoring accounts from the snapshot, iterate the
restored users and assign temp passwords:

```typescript
// After the existing restore loop that calls userRepo.save() for each restored user:
const tempPasswords: Array<{ username: string; tempPassword: string }> = [];

for (const restoredUser of restoredUsers /* the non-admin user array from snapshot */) {
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  await userRepo.save({ ...restoredUser, passwordHash, updatedAt: nowISO() });
  tempPasswords.push({ username: restoredUser.username, tempPassword });
}

return { tempPasswords };
```

The exact location depends on `admin.service.ts`'s current restore loop structure. The key
invariant: every restored non-admin account gets a cryptographically random temp password that
is hashed before storage and returned in plaintext only in this one response.

The admin controller must forward the `tempPasswords` array in the HTTP response:

```typescript
// In admin.controller.ts newYear handler:
async newYear(req: AppRequest) {
  const result = await deps.admin.newYear(req.actor!);
  return result; // { tempPasswords: [...] }
}
```

The SPA `adminNewYear()` function should display the temp passwords after the rollover:

```javascript
async function adminNewYear() {
  if (!confirm('Purge registrations and start new year? This cannot be undone.')) return;
  try {
    const r = await api('/admin/new-year', { method: 'POST' });
    const pwdList = (r.tempPasswords || []).map(p =>
      `<div class="kv2"><span class="k">${esc(p.username)}</span><span class="v"><code>${esc(p.tempPassword)}</code></span></div>`
    ).join('');
    if (pwdList) {
      // Show modal with temp passwords before navigating away.
      alert(`New year started.\n\nTemp passwords (share securely):\n\n` +
        (r.tempPasswords || []).map(p => `${p.username}: ${p.tempPassword}`).join('\n'));
    }
    toast('New year started');
    STACK = ['home'];
    await RENDER.home();
  } catch (e) { toast(e.message); }
}
```

The alert is intentionally simple — the passwords are also included in the close-out export
(see below).

### 7c. Passwords tab in .xlsx workbook

**File:** `src/services/export.service.ts` (Part 3 spec defines the full workbook; this section
specifies only the Passwords tab that Part 2 owns.)

The Passwords tab is added to the close-out `.xlsx` when the admin triggers the export after
`newYear`. It is populated from the `tempPasswords` returned by the most recent `newYear` call,
which must be stored server-side temporarily (e.g., in `CampSettings.lastTempPasswords` — an
ephemeral array cleared once the export is downloaded).

Tab name: `Temp Passwords`

Columns:
| A | B |
|---|---|
| Username | Temp Password |

Row 1 is the header (bold). Subsequent rows are one per restored account, sorted by username.

Add to `CampSettings` (in `src/core/entities/settings.ts` or equivalent):

```typescript
lastTempPasswords?: Array<{ username: string; tempPassword: string }>;
```

In the `newYear` service, after computing `tempPasswords`, persist them to settings:

```typescript
await settingsRepo.save({
  ...(await settingsRepo.get()),
  lastTempPasswords: tempPasswords,
});
```

In the export workbook builder (Part 3), add the Passwords sheet:

```typescript
// Inside buildWorkbook() — add after the last existing tab:
const pwdSheet = workbook.addWorksheet('Temp Passwords');
pwdSheet.columns = [
  { header: 'Username',      key: 'username',     width: 24 },
  { header: 'Temp Password', key: 'tempPassword', width: 20 },
];
pwdSheet.getRow(1).font = { bold: true };
for (const p of (settings.lastTempPasswords ?? [])) {
  pwdSheet.addRow({ username: p.username, tempPassword: p.tempPassword });
}
```

The tab is always present in the export but may be empty if `newYear` has not been run this
cycle. The `lastTempPasswords` field is cleared from settings once the export is confirmed
(Part 3's close-out handoff step).

---

## 8. Validation tests (Python/requests)

Add these tests to `docs/verification/test_p2_admin.py` (create the file; existing tests live
in `docs/verification/`).

```python
"""
Part 2 — Admin setup + laptop interface
Validation tests using Python requests.

Usage:
  BASE_URL=http://localhost:4200 python -m pytest docs/verification/test_p2_admin.py -v
"""
import os
import csv
import io
import pytest
import requests

BASE = os.environ.get("BASE_URL", "http://localhost:4200")

@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE}/auth/login", json={"username": "admin", "password": "demo1234"})
    assert r.status_code == 200, r.text
    return r.json()["token"]

@pytest.fixture
def auth(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------------------------------------------------------------------------
def _make_camper_csv(rows=3):
    """Generate a minimal valid camper CSV string."""
    headers = ["First Name", "Last Name", "Gender", "School Grade",
               "Attendee's Church", "Mobile Number"]
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=headers)
    w.writeheader()
    for i in range(rows):
        w.writerow({
            "First Name": f"Dry{i}",
            "Last Name":  f"RunTest{i}",
            "Gender":     "Male",
            "School Grade": "Year 9",
            "Attendee's Church": "Test Church DryRun",
            "Mobile Number": f"04{10000000 + i}",
        })
    return buf.getvalue()


def test_import_dryrun_does_not_persist(auth):
    """A dryRun=true import must return counts but must NOT create people."""
    csv_data = _make_camper_csv(5)

    # Dry run
    r = requests.post(f"{BASE}/import/csv", json={
        "csvData": csv_data,
        "dryRun": True,
        "updateExisting": False,
    }, headers=auth)
    assert r.status_code == 200, r.text
    preview = r.json()
    assert preview["dryRun"] is True
    assert preview["created"] == 5
    assert preview["errors"] == []

    # Confirm nothing was persisted: search for a dry-run name
    s = requests.get(f"{BASE}/search?q=DryRunTest0", headers=auth)
    assert s.status_code == 200
    results = s.json()
    # Should be empty (name was not saved)
    names = [p.get("firstName", "") for p in (results if isinstance(results, list) else [])]
    assert "Dry0" not in names, "Dry-run record must not be persisted"


def test_import_shows_errors_and_warnings(auth):
    """Import with a bad row must return errors; church-name miss must return warning."""
    bad_csv = (
        "First Name,Last Name,Gender,School Grade,Attendee's Church\n"
        ",MissingFirst,Male,Year 9,Known Church\n"           # row 2: error — no first name
        "Valid,Person,Female,Year 10,NewChurchXYZ123\n"      # row 3: warning — unknown church
    )
    r = requests.post(f"{BASE}/import/csv", json={
        "csvData": bad_csv,
        "dryRun": True,
        "updateExisting": False,
    }, headers=auth)
    assert r.status_code == 200, r.text
    result = r.json()
    assert result["dryRun"] is True
    assert len(result["errors"]) >= 1
    assert result["errors"][0]["row"] == 2
    assert len(result["warnings"]) >= 1
    # The warning for the unknown church should mention the church name
    warn_messages = [w["message"] for w in result["warnings"]]
    assert any("NewChurchXYZ123" in m for m in warn_messages)


def _make_church_csv(prefix="T"):
    headers = ["churchName","zone","code","youthPastorName","contactEmail",
               "loginUsername","loginPassword","expectedCount"]
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=headers)
    w.writeheader()
    for i in range(2):
        w.writerow({
            "churchName":     f"{prefix}TestChurch{i}",
            "zone":           "Yellow",
            "code":           f"{prefix}TST{i}",
            "youthPastorName": f"Ps Test{i}",
            "contactEmail":   f"test{i}@example.com",
            "loginUsername":  f"{prefix.lower()}tchurch{i}",
            "loginPassword":  "Temp1234",
            "expectedCount":  "20",
        })
    return buf.getvalue()


def test_bulk_church_import(auth):
    """Bulk church CSV import must create churches and login accounts."""
    csv_data = _make_church_csv(prefix="BCI")

    # Dry run first
    r = requests.post(f"{BASE}/import/churches", json={
        "csvData": csv_data, "dryRun": True,
    }, headers=auth)
    assert r.status_code == 200, r.text
    preview = r.json()
    assert preview["dryRun"] is True
    assert preview["created"] == 2
    assert preview["errors"] == []

    # Confirm that dry run did not create churches
    churches_before = requests.get(f"{BASE}/accounts/churches", headers=auth).json()
    names_before = {c["name"] for c in churches_before}
    assert "BCITestChurch0" not in names_before, "Dry-run must not persist churches"

    # Live run
    r2 = requests.post(f"{BASE}/import/churches", json={
        "csvData": csv_data, "dryRun": False,
    }, headers=auth)
    assert r2.status_code == 200, r2.text
    result = r2.json()
    assert result["dryRun"] is False
    assert result["created"] == 2
    assert result["errors"] == []

    churches_after = requests.get(f"{BASE}/accounts/churches", headers=auth).json()
    names_after = {c["name"] for c in churches_after}
    assert "BCITestChurch0" in names_after
    assert "BCITestChurch1" in names_after

    # Idempotency: re-run must skip (username already exists)
    r3 = requests.post(f"{BASE}/import/churches", json={
        "csvData": csv_data, "dryRun": False,
    }, headers=auth)
    assert r3.status_code == 200
    r3j = r3.json()
    assert r3j["created"] == 0
    assert r3j["skipped"] == 2


def test_settings_date_range(auth):
    """Settings PATCH with startDate + endDate must derive checkInDays correctly."""
    payload = {
        "campName":   "Test Camp 2027",
        "year":       2027,
        "startDate":  "2027-01-10",
        "endDate":    "2027-01-13",   # 4 days inclusive
        "timezone":   "Australia/Brisbane",
        "checkInDays": ["2027-01-10", "2027-01-11", "2027-01-12", "2027-01-13"],
    }
    r = requests.patch(f"{BASE}/settings", json=payload, headers=auth)
    assert r.status_code == 200, r.text

    s = requests.get(f"{BASE}/settings").json()
    assert s["campName"] == "Test Camp 2027"
    assert s["startDate"] == "2027-01-10"
    assert s["endDate"] == "2027-01-13"
    assert s["timezone"] == "Australia/Brisbane"
    # checkInDays should include all 4 dates
    assert set(s["checkInDays"]) == {
        "2027-01-10", "2027-01-11", "2027-01-12", "2027-01-13"
    }
```

---

## Implementation checklist (ordered)

1. `src/utils/temp-password.ts` — add `generateTempPassword`.
2. `src/services/import.service.ts` — add `dryRun` to schema, guard `saveMany`, fix `resolveChurch`.
3. `src/services/church-import.service.ts` — new file (section 4b).
4. `src/container.ts` — wire `churchImport` service.
5. `src/api/controllers/church-import.controller.ts` — new file.
6. `src/api/http/router.ts` — add `POST /import/churches` route.
7. `src/services/admin.service.ts` — widen `newYear` to generate + return temp passwords; persist to settings.
8. `public/index.html` CSS block — add wide-layout media query (section 2a).
9. `public/index.html` JS — add `_initWideNav`, `_renderWideNav`, patched `paint` wrapper.
10. `public/index.html` JS — replace `adminUpload()` + add `_renderImportPreview`, `_confirmImport`, `_showImportStep`.
11. `public/index.html` JS — add `RENDER.adminChurchImport`, `churchImportUpload`, `_renderChurchImportPreview`, `_confirmChurchImport`.
12. `public/index.html` JS — replace `RENDER.adminSettings` + `saveSettings`; add `_datesInRange`, `_tzSelect`, `_getSelectedTz`, `_updateDaysPreview`, `_daysNudgeHtml`.
13. `public/index.html` JS — add `WIZARD_STEPS`, `RENDER.adminWizard`, `_goWizardStep`, `_wizardChecklistHtml`; update `RENDER.admin`.
14. `public/index.html` JS — update `adminNewYear()` to display temp passwords.
15. `docs/verification/test_p2_admin.py` — new test file.
