# Part 4 — First-aid Role

## 1. Overview

### Design intent

The `firstAid` role turns the platform into a 2-tap casualty card for on-ground medical staff. A first-aider finds a camper by name (1 tap), sees a medical-first card that surfaces conditions, dietary needs, other medications, Medicare number, consent, and DOB/age immediately (2 taps). The role is camp-wide, read-only for all data except attendance sign-in/out, and every access to sensitive fields is logged server-side.

### Dependency on Part 0 (Presence model, P0)

The casualty card's "PRESENCE" section depends on the P0 decision that `atCamp` is the single source of truth for whether a person is currently on site. The sign-in/sign-out buttons in the card go through the existing `POST /attendance/sign-in` / `POST /attendance/sign-out` paths — the same HMAC-authenticated paths used by the church role. `firstAid` gets `checkin:write` specifically to exercise those paths; it does NOT get `camper:write` or `note:write`.

### What is NOT in scope

- Creating, editing, or deleting person records.
- Writing notes (pastoral, testimony, or otherwise).
- Accessing pre-camp registrant data (`registrant:read` is not granted).
- Any admin:manage action (accounts, settings, accommodation, etc.).
- Sending notifications.

---

## 2. Role and RBAC changes

### 2a. `enums.ts` — updated `USER_ROLES` array

File: `src/core/types/enums.ts`, line 11.

Add `'firstAid'` to the tuple. Because `USER_ROLES` is used as a Zod enum in `account.schema.ts`, the addition here automatically flows into all validation once that schema references the same constant.

```typescript
// Before
export const USER_ROLES = ['church', 'zoneLeader', 'director', 'admin'] as const;

// After
export const USER_ROLES = ['church', 'zoneLeader', 'director', 'admin', 'firstAid'] as const;
export type UserRole = (typeof USER_ROLES)[number];
```

No other enum changes are required. `firstAid` accounts carry no `churchId` and no `zone` (both `null`), matching the `director` profile.

### 2b. `access-control.ts` — `ROLE_PERMISSIONS` entry for `firstAid`

File: `src/services/access-control.ts`.

Add the following entry to `ROLE_PERMISSIONS`. The record type is `Record<UserRole, Set<Action>>` so TypeScript will error at compile-time if `firstAid` is missing after the enum is updated — the compiler gate enforces completeness.

```typescript
const ROLE_PERMISSIONS: Record<UserRole, Set<Action>> = {
  church: new Set<Action>([
    'registrant:read',
    'registrant:write',
    'reminder:send',
    'camper:read',
    'camper:read:sensitive',
    'checkin:write',
    'note:write',
  ]),
  zoneLeader: new Set<Action>([
    'registrant:read',
    'camper:read',
    'camper:read:sensitive',
    'checkin:write',
    'note:write',
    'note:read',
    'notification:send:zone',
  ]),
  director: new Set<Action>([
    'registrant:read',
    'registrant:write',
    'reminder:send',
    'camper:read',
    'camper:read:sensitive',
    'camper:write',
    'checkin:write',
    'note:write',
    'note:read',
    'notification:send:zone',
    'notification:send:camp',
    'import:run',
  ]),
  admin: new Set<Action>([
    'registrant:read',
    'registrant:write',
    'reminder:send',
    'camper:read',
    'camper:read:sensitive',
    'camper:write',
    'checkin:write',
    'note:write',
    'note:read',
    'notification:send:zone',
    'notification:send:camp',
    'import:run',
    'admin:manage',
  ]),
  // First-aid: read-only + attendance only. No write on people, notes, admin.
  firstAid: new Set<Action>([
    'camper:read',
    'camper:read:sensitive',
    'checkin:write',           // attendance sign-in/out only
  ]),
};
```

Permissions explicitly NOT granted to `firstAid`:

| Action | Reason |
|---|---|
| `registrant:read` | Pre-camp registration data is not first-aid's concern |
| `registrant:write` | Write access denied |
| `camper:write` | Updating person records denied |
| `note:write` | Notes are pastoral; first-aid logs are separate (access log) |
| `note:read` | Pastoral notes not appropriate for first-aid |
| `reminder:send` | N/A |
| `notification:send:zone` | N/A |
| `notification:send:camp` | N/A |
| `import:run` | N/A |
| `admin:manage` | N/A |

### 2c. `person.service.ts` — updated `canAccessPerson`

File: `src/services/person.service.ts`, function `canAccessPerson` (currently lines 81–93).

`firstAid` is camp-wide — it sees every person who is a camper (the `isCamper` filter in `listCampers` still applies). Adding the case before `default` is sufficient; the `default: return false` remains.

```typescript
export function canAccessPerson(actor: Actor, person: Pick<Person, 'churchId' | 'zone'>): boolean {
  switch (actor.role) {
    case 'admin':
    case 'director':
      return true;
    case 'zoneLeader':
      return actor.zone != null && person.zone === actor.zone;
    case 'church':
      return actor.churchId === person.churchId;
    case 'firstAid':
      return true;           // camp-wide read access; no zone/church restriction
    default:
      return false;
  }
}
```

### 2d. `access-control.ts` — updated `canAccessChurch`

File: `src/services/access-control.ts`, function `canAccessChurch` (currently lines 87–100).

First-aid should be able to call any route that does a `canAccessChurch` guard (e.g. resolving church contacts for the leaders section of the casualty card). Add `firstAid` alongside `admin` and `director`.

```typescript
export function canAccessChurch(actor: Actor, churchId: string, churchZone?: string): boolean {
  switch (actor.role) {
    case 'admin':
    case 'director':
    case 'firstAid':           // camp-wide access; no zone/church restriction
      return true;
    case 'zoneLeader':
      if (!actor.zone || !churchZone) return false;
      return actor.zone === churchZone;
    case 'church':
      return actor.churchId === churchId;
    default:
      return false;
  }
}
```

---

## 3. CamperDto widening

### 3a. Updated `CamperDto` interface

File: `src/api/dto/person.dto.ts`.

Three fields that already exist on the `Person` entity and are already exposed by `RegistrantDto` are added to `CamperDto`. They were always in the DB; they were simply never surfaced in the at-camp DTO because the at-camp screens did not need them. First-aid needs them for the casualty card without a separate round-trip.

```typescript
export interface CamperDto {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  kind: 'student' | 'leader';
  churchId: string;
  churchName: string;
  zone: string;
  groupId: string | null;
  mobile: string | null;
  grade: Person['grade'];
  gender: Person['gender'];              // added — needed for first-aid card + roster (P1)
  medicalConditions: string[];
  dietaryRequirements: string[];
  otherMedications: string | null;       // added — extended medical for first-aid
  medicareNumber: string | null;         // added — extended medical for first-aid
  parentGuardianName: string | null;
  parentPhone: string | null;
  parentRelation: string | null;         // added — relation (e.g. "Mother")
  blueCardNumber: string | null;
  blueCardExpiry: string | null;
  consentMedical: boolean;               // added — consent flag for casualty card
  lifecycle: Person['lifecycle'];
  atCamp: boolean;
  checkInHistory: Person['checkInHistory'];
  signOutHistory: Person['signOutHistory'];
  createdAt: string;
  updatedAt: string;
}
```

Note: `gender` and `medicalFlag` are also required for Part 1's RosterEntry DTO extension. Adding `gender` to `CamperDto` here satisfies both parts simultaneously.

### 3b. Updated `toCamperDto` function

```typescript
export function toCamperDto(p: Person): CamperDto {
  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    fullName: `${p.firstName} ${p.lastName}`,
    kind: p.kind === 'leader' ? 'leader' : 'student',
    churchId: p.churchId,
    churchName: p.churchName,
    zone: p.zone,
    groupId: p.groupId ?? null,
    mobile: p.mobile ?? null,
    grade: p.grade ?? null,
    gender: p.gender,
    medicalConditions: p.medicalConditions,
    dietaryRequirements: p.dietaryRequirements,
    otherMedications: p.otherMedications ?? null,
    medicareNumber: p.medicareNumber ?? null,
    parentGuardianName: p.parentGuardianName ?? null,
    parentPhone: p.parentPhone ?? null,
    parentRelation: p.parentRelation ?? null,
    blueCardNumber: p.blueCardNumber ?? null,
    blueCardExpiry: p.blueCardExpiry ?? null,
    consentMedical: p.consents.medical?.granted ?? false,
    lifecycle: p.lifecycle,
    atCamp: p.atCamp,
    checkInHistory: p.checkInHistory,
    signOutHistory: p.signOutHistory,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
```

### 3c. Roles that now receive the extended DTO

All roles that can call `GET /campers` or `GET /campers/:id` receive the widened DTO because `toCamperDto` is called unconditionally. This is intentional:

- `church`, `zoneLeader`, `director`, `admin`: already had access to this data via `RegistrantDto` or direct DB access. Surfacing it in `CamperDto` is a convenience, not a new disclosure.
- `firstAid`: the primary consumer; needs `otherMedications`, `medicareNumber`, `parentRelation`, `consentMedical`, and `gender` for the casualty card.

If a future policy review requires hiding `medicareNumber` from `church`/`zoneLeader` roles, a DTO selector function (e.g. `toCamperDtoForRole(p, actor)`) can be introduced at that point. For now, the unified DTO is correct — `camper:read:sensitive` already gates the route.

---

## 4. Auth and account changes

### 4a. `account.schema.ts` — add `firstAid` to role enums

File: `src/core/validation/account.schema.ts`.

Because `CreateUserSchema` and `UpdateUserSchema` both do `z.enum(USER_ROLES)`, updating `USER_ROLES` in `enums.ts` (section 2a) automatically propagates here — Zod reads the tuple at module load time. No manual string changes are needed in this file.

However, the `createUser` guard in `account.service.ts` (line 48) currently blocks `role === 'admin'`. `firstAid` should NOT be blocked here; admin should be able to create first-aid accounts via the normal `POST /accounts/users` flow. The existing guard is role-specific to `'admin'` and needs no change.

Verify: after the `USER_ROLES` change, run `npm run typecheck`. TypeScript will confirm the exhaustiveness of `ROLE_PERMISSIONS` in `access-control.ts` because `Record<UserRole, ...>` requires a key for every member of the union.

### 4b. SPA `renderAdminAccounts` — add `firstAid` to role selector

File: `public/index.html`.

**`roleOpts` constant** (currently line 1203):

```javascript
// Before
const roleOpts = `<option value="director">Director</option><option value="zoneLeader">Zone leader</option>`;

// After
const roleOpts = `<option value="director">Director</option>
  <option value="zoneLeader">Zone leader</option>
  <option value="firstAid">First aid</option>`;
```

**`aRoleChange` function** (currently lines 1227–1231):

The function currently hides the church selector for `director` and shows the zone selector for `zoneLeader`. `firstAid` has neither church nor zone — hide both.

```javascript
function aRoleChange() {
  const r = document.getElementById('aR').value;
  // church selector: only for church role (currently always hidden for non-church — keep)
  document.getElementById('aChurchWrap').style.display = 'none';
  // zone selector: only for zoneLeader
  document.getElementById('aZoneWrap').style.display = r === 'zoneLeader' ? 'block' : 'none';
}
```

The current implementation already hides `aChurchWrap` for all non-church roles, so `firstAid` is covered. `aZoneWrap` is hidden for `firstAid` because `r !== 'zoneLeader'`. No change to the logic is strictly needed — this section documents the intended behavior for the implementer to verify.

**`addAcct` function**: when `role === 'firstAid'`, do not attach `zone` or `churchId` to the body. The current implementation only sets `body.zone` when `role === 'zoneLeader'`, so `firstAid` is already handled correctly by the existing conditional.

**Display in the leadership accounts list**: the `leaderRoles` filter (line 1191) currently shows only `zoneLeader` and `director`. Add `firstAid`:

```javascript
// Before
const leaderRoles = ['zoneLeader', 'director'];

// After
const leaderRoles = ['zoneLeader', 'director', 'firstAid'];
```

---

## 5. SPA tab set and navigation

### 5a. `buildTabs` for `firstAid`

File: `public/index.html`, `buildTabs` function (lines 410–427).

The `firstAid` role is at-camp only and needs three tabs: a dedicated home, search (to reach the casualty card), and schedule (to know where students are during the day). It does NOT get: check-in (daily session roster is not a first-aid concern), notices, admin, or the pre-camp tabs.

```javascript
function buildTabs() {
  let tabs;
  if (CAMP_MODE === 'pre-camp') {
    tabs = [['home', 'home', 'Home'], ['people', 'users', 'My Youth']];
    if (ACTOR && ['director', 'admin'].includes(ACTOR.role)) tabs.push(['data', 'users', 'Data']);
    if (ACTOR && ACTOR.role === 'admin') {
      tabs.push(['notifs', 'bell', 'Notices']);
      tabs.push(['admin', 'gear', 'Admin']);
    } else {
      tabs.push(['help', 'help', 'Help']);
      tabs.push(['notifs', 'bell', 'Notices']);
    }
  } else {
    // at-camp
    if (ACTOR && ACTOR.role === 'firstAid') {
      tabs = [
        ['home',     'home',   'Home'],
        ['search',   'search', 'Search'],
        ['schedule', 'clock',  'Schedule'],
      ];
    } else if (ACTOR && ACTOR.role === 'admin') {
      tabs = [
        ['home',    'home',   'Home'],
        ['checkin', 'check',  'Check-in'],
        ['search',  'search', 'Search'],
        ['admin',   'gear',   'Admin'],
      ];
    } else {
      tabs = [
        ['home',    'home',   'Home'],
        ['checkin', 'check',  'Check-in'],
        ['search',  'search', 'Search'],
        ['notifs',  'bell',   'Notices'],
      ];
    }
  }
  document.getElementById('tabs').innerHTML = tabs.map(([id, name, l]) =>
    `<button class="tab" data-tab="${id}" onclick="gotoTab('${id}')">` +
    `<span class="ic">${ic(name)}</span>${l}</button>`
  ).join('');
}
```

### 5b. First-aid home — `renderHomeFirstAid`

Called from `RENDER.home` when `ACTOR.role === 'firstAid'` and `CAMP_MODE === 'at-camp'`. The home is action-oriented: the search box is the dominant element. Two summary tiles give situational awareness without exposing data that isn't first-aid's concern.

```javascript
// In RENDER.home, add at the top of the at-camp branch:
RENDER.home = async function renderHome() {
  if (CAMP_MODE === 'at-camp') {
    if (ACTOR && ACTOR.role === 'firstAid') {
      await renderHomeFirstAid();
      return;
    }
    await renderHomeAtCamp();
    return;
  }
  // ... pre-camp home unchanged
};

async function renderHomeFirstAid() {
  const h = await api('/home');
  const atCampCount = h.atCampCount ?? 0;

  const html = `
    <div class="hero" style="background:radial-gradient(130% 130% at 100% 0%,#b91c1c,#12233b 78%)">
      <div class="k">First Aid</div>
      <h2>Hi ${esc(ACTOR.displayName)}</h2>
      <div style="color:#fca5a5;font-size:.82rem;margin-top:4px">${atCampCount} camper${atCampCount === 1 ? '' : 's'} currently on site</div>
    </div>

    <div class="card" style="padding:12px">
      <div class="lbl" style="margin:0 0 6px">Quick search</div>
      <div style="display:flex;gap:6px">
        <input class="fld" id="faHomeQ" placeholder="Name or church…" style="flex:1;margin:0"
          onkeydown="if(event.key==='Enter')faHomeSearch()">
        <button class="btn" style="flex:none;padding:0 14px" onclick="faHomeSearch()">
          ${ic('search')}
        </button>
      </div>
    </div>

    <div class="tiles" style="margin-top:10px">
      <div class="tile" onclick="gotoTab('search')">
        <div class="l">Medical Watch</div>
        <div class="sub" style="color:#fca5a5">Campers with flags</div>
      </div>
      <div class="tile" onclick="gotoTab('schedule')">
        <div class="l">Today's Schedule</div>
        <div class="sub">Session times</div>
      </div>
    </div>`;

  paint('home', html, 'First Aid', (SETTINGS && SETTINGS.campName) || 'Camp');
  document.getElementById('faHomeQ')?.focus();
}

function faHomeSearch() {
  const q = (document.getElementById('faHomeQ')?.value ?? '').trim();
  if (!q) return;
  // Reuse the search tab's renderer with a pre-filled query
  window._faSearchQ = q;
  gotoTab('search');
}
```

The "Medical Watch" tile on the home navigates to the search tab where `RENDER.search` for `firstAid` renders the Medical Watch list (see section 7). The home tile is a shortcut, not a separate screen.

---

## 6. Casualty card — the core deliverable

### 6a. `renderSearchFirstAid` — search and entry point

`RENDER.search` branches on role. For `firstAid`, it renders two views: a default Medical Watch list (all at-camp campers with any medical flag, returned by `GET /campers/medical`) and a name search that jumps to the casualty card.

```javascript
RENDER.search = async function renderSearch() {
  if (ACTOR && ACTOR.role === 'firstAid') {
    await renderSearchFirstAid();
    return;
  }
  // ... existing search render unchanged
};

async function renderSearchFirstAid() {
  const prefill = window._faSearchQ || '';
  window._faSearchQ = null;

  paint('search', `
    <div style="display:flex;gap:6px;margin-bottom:12px">
      <input class="fld" id="faQ" placeholder="Search by name…" value="${esc(prefill)}"
        style="flex:1;margin:0" onkeydown="if(event.key==='Enter')runFaSearch()">
      <button class="btn" style="flex:none;padding:0 14px" onclick="runFaSearch()">
        ${ic('search')}
      </button>
    </div>
    <div id="faResults"></div>
    <div id="faMedWatch"></div>
  `, 'Search', 'Casualty card + Medical Watch');

  if (prefill) {
    await runFaSearch();
  } else {
    await loadMedicalWatch();
  }
}

async function runFaSearch() {
  const q = (document.getElementById('faQ')?.value ?? '').trim();
  const box = document.getElementById('faResults');
  if (!box) return;
  if (!q) { box.innerHTML = ''; await loadMedicalWatch(); return; }

  box.innerHTML = '<p class="note-hint">Searching…</p>';
  document.getElementById('faMedWatch').innerHTML = '';

  try {
    const results = await api('/search?q=' + encodeURIComponent(q));
    if (!results.length) {
      box.innerHTML = '<p class="note-hint">No campers found.</p>';
      return;
    }
    box.innerHTML = results.map(r => {
      const c = r.camper;
      const hasMed = (c.medicalConditions && c.medicalConditions.length > 0) ||
                     (c.dietaryRequirements && c.dietaryRequirements.length > 0) ||
                     c.otherMedications;
      const medBadge = hasMed
        ? `<span class="pill warn" style="font-size:.6rem">MED</span> `
        : '';
      return `<div class="row" onclick="openCasualtyCard('${c.id}')">
        <div class="av ${esc(c.gender || '')}">${initials(c.firstName + ' ' + c.lastName)}</div>
        <div style="flex:1;min-width:0">
          <div class="nm">${esc(c.firstName + ' ' + c.lastName)} ${medBadge}</div>
          <div class="sub">${esc(c.churchName)} · ${c.kind === 'leader' ? 'Leader' : 'Yr ' + (c.grade || '—')}</div>
        </div>
        <span class="chev">›</span>
      </div>`;
    }).join('');
  } catch (e) {
    box.innerHTML = `<p class="note-hint">${esc(e.message)}</p>`;
  }
}
```

### 6b. `openCasualtyCard` — complete function

This is the first-aid equivalent of `openCamper`. It is called from the search results list and from the Medical Watch list. It renders a medical-first card: the medical section is rendered at the top, before attendance and contact details.

```javascript
async function openCasualtyCard(id, push = true) {
  // Fetch the camper DTO — firstAid has camper:read:sensitive so the full DTO is returned.
  const p = await api('/campers/' + id);
  const fullName = p.fullName || (p.firstName + ' ' + p.lastName);

  // --- derived values ---
  const hasMedConditions = (p.medicalConditions && p.medicalConditions.length > 0);
  const hasDietary       = (p.dietaryRequirements && p.dietaryRequirements.length > 0);
  const hasMedications   = !!p.otherMedications;
  const hasAnyMedFlag    = hasMedConditions || hasDietary || hasMedications;
  const medBg            = hasAnyMedFlag
    ? 'background:#fef2f2;border-color:#fca5a5'   // red tint when flagged
    : '';

  // DOB + age
  let dobStr = '—';
  if (p.dateOfBirth) {
    const dob = new Date(p.dateOfBirth);
    const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000));
    dobStr = `${p.dateOfBirth} (age ${age})`;
  }

  // Last sign-out event
  const lastSignOut = (p.signOutHistory || []).filter(e => e.type === 'out').slice(-1)[0] || null;

  // --- 1. MEDICAL SECTION ---
  const medSection = `
    <div class="card" style="${medBg}">
      <div class="h3" style="margin-top:0;color:${hasAnyMedFlag ? '#b91c1c' : 'inherit'}">
        ${hasAnyMedFlag ? ic('alert') + ' ' : ''}Medical
      </div>
      <div class="kv">
        <span class="k">Conditions</span>
        <span class="v">${hasMedConditions ? esc(p.medicalConditions.join(', ')) : '<span style="color:#94a3b8">None recorded</span>'}</span>
      </div>
      <div class="kv">
        <span class="k">Dietary</span>
        <span class="v">${hasDietary ? esc(p.dietaryRequirements.join(', ')) : '<span style="color:#94a3b8">None recorded</span>'}</span>
      </div>
      <div class="kv">
        <span class="k">Medications</span>
        <span class="v">${hasMedications ? esc(p.otherMedications) : '<span style="color:#94a3b8">None recorded</span>'}</span>
      </div>
      <div class="kv">
        <span class="k">Medicare</span>
        <span class="v">
          ${p.medicareNumber
            ? `<span id="mc_${id}" style="cursor:pointer;color:#2563eb;text-decoration:underline"
                onclick="revealMedicare('${id}','${esc(p.medicareNumber)}',this)">Tap to reveal</span>`
            : '<span style="color:#94a3b8">Not recorded</span>'}
        </span>
      </div>
      <div class="kv">
        <span class="k">Medical consent</span>
        <span class="v">${p.consentMedical
          ? '<span class="pill ok">Granted</span>'
          : '<span class="pill warn">NOT granted</span>'}</span>
      </div>
      <div class="kv">
        <span class="k">DOB / Age</span>
        <span class="v">${esc(dobStr)}</span>
      </div>
    </div>`;

  // --- 2. PRESENCE SECTION (P0 dependent) ---
  const presenceSection = `
    <div class="card">
      <div class="h3" style="margin-top:0">Presence</div>
      <div class="kv">
        <span class="k">Status</span>
        <span class="v">${p.atCamp
          ? '<span class="pill ok">On site</span>'
          : '<span class="pill warn">Not on site</span>'}</span>
      </div>
      ${!p.atCamp && lastSignOut ? `
        <div class="kv"><span class="k">Signed out by</span><span class="v">${esc(lastSignOut.leaderName || '—')}</span></div>
        <div class="kv"><span class="k">Reason</span><span class="v">${esc(lastSignOut.reason || '—')}</span></div>
        <div class="kv"><span class="k">Parents met</span><span class="v">${lastSignOut.parentsMet ? 'Yes' : 'No'}</span></div>
      ` : ''}
      ${p.atCamp
        ? `<button class="btn red" style="margin-top:8px"
              onclick="signOutPrompt('${id}','${esc(fullName)}')">Sign out of camp</button>`
        : `<button class="btn" style="margin-top:8px"
              onclick="signInPrompt('${id}','${esc(fullName)}')">
              ${(p.signOutHistory || []).some(e => e.type === 'out')
                ? 'Sign back in to camp'
                : 'Sign in to camp (late arrival)'}
           </button>`
      }
    </div>`;

  // --- 3. PARENT / GUARDIAN SECTION ---
  const parentSection = p.kind !== 'leader' ? `
    <div class="card">
      <div class="h3" style="margin-top:0">Parent / Guardian</div>
      <div class="kv">
        <span class="k">Name</span>
        <span class="v">${esc(p.parentGuardianName || '—')}${p.parentRelation ? ' (' + esc(p.parentRelation) + ')' : ''}</span>
      </div>
      <div class="kv">
        <span class="k">Phone</span>
        <span class="v"><a href="tel:${esc(p.parentPhone || '')}" style="color:#2563eb;text-decoration:none">${esc(p.parentPhone || '—')}</a></span>
      </div>
    </div>` : '';

  // --- 4. LEADERS / CONTACTS SECTION ---
  // Uses the same masked/reveal pattern as the existing search screen:
  // initial contacts are masked, tap reveals (logged by revealContact).
  let contactsHtml = '';
  try {
    const contacts = await api('/search/contacts/' + id);
    if (contacts && contacts.length) {
      const rows = contacts.map(c =>
        `<div class="kv">
          <span class="k">${esc(c.name)}<br><span style="font-size:.68rem;color:#94a3b8">${c.gender} · ${c.type}</span></span>
          <span class="v">
            <span id="ph_${id}_${esc(c.role)}" style="cursor:pointer;color:#2563eb;text-decoration:underline"
              onclick="revealLeaderPhone('${id}','${esc(c.role)}',this)">${esc(c.phone)}</span>
          </span>
        </div>`
      ).join('');
      contactsHtml = `<div class="card"><div class="h3" style="margin-top:0">Leaders / Contacts</div>${rows}</div>`;
    }
  } catch (_) {
    // Non-fatal: contacts section omitted if lookup fails
  }

  // --- Compose card ---
  const cardHtml = `
    <div class="detail-hd">
      <div class="av-lg ${esc(p.gender || '')}">${initials(fullName)}</div>
      <h2>${esc(fullName)}</h2>
      <div style="color:#cfe0ff;font-size:.82rem">
        ${esc(p.zone)} Zone · ${p.kind === 'leader' ? 'Leader' : 'Grade ' + (p.grade || '—')}
        · ${esc(p.churchName)}
      </div>
    </div>
    ${medSection}
    ${presenceSection}
    ${parentSection}
    ${contactsHtml}`;

  // Render into the shared 'camper' screen element (reuse existing screen slot)
  document.getElementById('camper').innerHTML = cardHtml;
  const el = document.getElementById('camper');
  if (el) el.scrollTop = 0;
  if (push && STACK[STACK.length - 1] !== 'camper') STACK.push('camper');
  _paint('camper', '', fullName, p.zone + ' Zone · First Aid');
  _showScreen('camper');
}
```

**Helper — `revealLeaderPhone`**: delegates to the existing `revealContact` flow used by the regular search screen. The server logs the reveal.

```javascript
async function revealLeaderPhone(camperId, contactRole, el) {
  try {
    const result = await api(`/search/contact/${camperId}/${contactRole}`);
    el.innerHTML = `<a href="tel:${esc(result.phone)}" style="color:#2563eb;text-decoration:none">${esc(result.phone)}</a>`;
    el.onclick = null;
  } catch (e) {
    toast(e.message);
  }
}
```

---

## 7. Medical Watch list

### 7a. New `GET /campers/medical` route

This route returns all at-camp persons with any medical flag (at least one of: non-empty `medicalConditions`, non-empty `dietaryRequirements`, non-null `otherMedications`). It is accessible to `firstAid`, `director`, and `admin`.

**Service method** — add to `PersonService` interface and `makePersonService`:

```typescript
// In PersonService interface:
listMedicalWatch(actor: Actor): Promise<Person[]>;

// In makePersonService:
async listMedicalWatch(actor) {
  assertCan(actor, 'camper:read:sensitive');
  const all = await repo.findAll();
  return all.filter(p =>
    isCamper(p) &&
    p.atCamp &&
    canAccessPerson(actor, p) &&
    (
      p.medicalConditions.length > 0 ||
      p.dietaryRequirements.length > 0 ||
      p.otherMedications != null
    )
  );
},
```

`firstAid` holds `camper:read:sensitive` and `canAccessPerson` returns `true` for `firstAid`, so the filter passes all flagged at-camp campers. `director` and `admin` also hold `camper:read:sensitive`.

### 7b. Controller method and route definition

**Controller** (add to the person/camper controller, alongside the existing camper handlers):

```typescript
async getMedicalWatch(req: Request, res: Response): Promise<void> {
  const actor = req.actor;  // set by auth middleware
  const persons = await personService.listMedicalWatch(actor);
  res.json(persons.map(toCamperDto));
}
```

**Route** (in `router.ts`, add before the `GET /campers/:id` route to avoid the parameterized route swallowing the literal segment `"medical"`):

```typescript
{ method: 'GET', path: '/campers/medical', handler: camperController.getMedicalWatch,
  roles: ['firstAid', 'director', 'admin'] },
```

The route is guarded by both the role whitelist in the router and `assertCan(actor, 'camper:read:sensitive')` inside the service.

### 7c. `RENDER.medicalWatch` — SPA function and integration

The Medical Watch list is rendered inside the `search` tab for `firstAid` users (as the default view before any name search is typed). It is reached from the home tile ("Medical Watch") and appears automatically when `renderSearchFirstAid` loads without a prefill query.

```javascript
async function loadMedicalWatch() {
  const box = document.getElementById('faMedWatch');
  if (!box) return;
  box.innerHTML = '<p class="note-hint">Loading Medical Watch…</p>';

  try {
    const campers = await api('/campers/medical');
    if (!campers.length) {
      box.innerHTML = `
        <div class="callbox" style="background:#f0fdf4;border-color:#86efac">
          <b>No medical flags on site</b><br>
          <span style="font-size:.82rem">All at-camp campers have no recorded conditions.</span>
        </div>`;
      return;
    }

    const header = `<div class="lbl" style="margin-top:4px">
      Medical Watch — ${campers.length} camper${campers.length === 1 ? '' : 's'} on site with flags
    </div>`;

    const rows = campers.map(c => {
      const flags = [
        ...(c.medicalConditions || []),
        ...(c.dietaryRequirements || []).map(d => `Diet: ${d}`),
        c.otherMedications ? `Meds: ${c.otherMedications}` : null,
      ].filter(Boolean);

      return `<div class="row" onclick="openCasualtyCard('${c.id}')">
        <div class="av ${esc(c.gender || '')}">${initials(c.firstName + ' ' + c.lastName)}</div>
        <div style="flex:1;min-width:0">
          <div class="nm">${esc(c.firstName + ' ' + c.lastName)}</div>
          <div class="sub" style="color:#b91c1c;font-size:.72rem">${esc(flags.join(' · '))}</div>
          <div class="sub">${esc(c.churchName)} · ${c.kind === 'leader' ? 'Leader' : 'Yr ' + (c.grade || '—')}</div>
        </div>
        <span class="chev">›</span>
      </div>`;
    }).join('');

    box.innerHTML = header + rows;
  } catch (e) {
    box.innerHTML = `<p class="note-hint">${esc(e.message)}</p>`;
  }
}
```

Non-`firstAid` roles do not see the `/campers/medical` endpoint surfaced in their UI. The route is accessible to `director` and `admin` programmatically but has no dedicated screen for those roles in this spec.

---

## 8. Medical access logging

Every `GET /campers/:id` request where `actor.role === 'firstAid'` must be logged server-side. This is the audit trail for clinical governance — if a camper's medical record was accessed, there must be a timestamped record of who accessed it and when.

**Implementation** — add to the camper GET handler in the person controller, after the DTO is built but before the response is sent:

```typescript
async getCamper(req: Request, res: Response): Promise<void> {
  const actor = req.actor;
  const person = await personService.get(actor, req.params.id);
  const dto = toCamperDto(person);

  // Medical access audit log — always log for firstAid; log for all roles
  // on sensitive access (otherMedications/medicareNumber present).
  if (actor.role === 'firstAid' || dto.otherMedications || dto.medicareNumber) {
    logger.info(
      `medical_access camper=${person.id} actor=${actor.id} role=${actor.role} ` +
      `hasMed=${dto.medicalConditions.length > 0} hasMedicare=${!!dto.medicareNumber}`
    );
  }

  res.json(dto);
}
```

The logger used is `createLogger('firstaid')` (a new named logger) or the existing controller logger. The log format matches the existing pattern used in `search.service.ts` line 133: `logger.info(...)`.

For the medical watch endpoint (`GET /campers/medical`), log the batch access:

```typescript
logger.info(
  `medical_watch_access actor=${actor.id} role=${actor.role} count=${persons.length}`
);
```

These logs flow to Vercel's log aggregation in production. No additional DB table is required for the initial implementation; if a structured audit log table is needed for compliance export, it can be added in a future iteration referencing this spec.

---

## 9. Medicare reveal pattern

Medicare numbers must not appear in plain text on the casualty card on load. They are loaded in the `CamperDto` on the server response (the DTO already contains the value), but they are masked on the client until the first-aider explicitly taps to reveal. On tap, the client-side value is displayed and the reveal is logged server-side via a dedicated call (matching the `revealContact` pattern in `search.service.ts`).

### Client-side tap-to-reveal

The Medicare span in the casualty card (section 6b) renders as:

```html
<span id="mc_<id>" style="cursor:pointer;color:#2563eb;text-decoration:underline"
  onclick="revealMedicare('<id>','<masked_value>',this)">Tap to reveal</span>
```

The Medicare number is available in the DTO but is not rendered until the tap. The `revealMedicare` function:

```javascript
async function revealMedicare(camperId, value, el) {
  // Log the reveal server-side before displaying
  try {
    await api('/campers/' + camperId + '/reveal-medicare', { method: 'POST', body: {} });
  } catch (_) {
    // Non-fatal: log failure should not block display
  }
  el.textContent = value;
  el.style.cursor = 'default';
  el.style.textDecoration = 'none';
  el.style.color = 'inherit';
  el.onclick = null;
}
```

### Server-side reveal log endpoint

`POST /campers/:id/reveal-medicare` — requires `camper:read:sensitive`. Logs and returns 204.

```typescript
async revealMedicare(req: Request, res: Response): Promise<void> {
  const actor = req.actor;
  assertCan(actor, 'camper:read:sensitive');
  const person = await personService.get(actor, req.params.id);
  logger.info(
    `medicare_revealed camper=${person.id} actor=${actor.id} role=${actor.role}`
  );
  res.status(204).end();
}
```

Route registration:

```typescript
{ method: 'POST', path: '/campers/:id/reveal-medicare', handler: camperController.revealMedicare,
  roles: ['firstAid', 'director', 'admin'] },
```

This pattern is intentionally a round-trip even though the value is already in the DTO. The round-trip creates an unambiguous server-side audit event. The value was transmitted at DTO load time — the reveal endpoint does not retransmit the value; it only records that the human chose to view it.

---

## 10. Validation tests

File: `docs/verification/` (Python/requests harness, matching the existing test suite pattern).

All tests assume a running local server (`http://localhost:4200`) with seed data. A `firstAid` test account (`username: firstaid`, `password: demo1234`) must be seeded or created before the tests run.

### test_firstaid_can_search_all_campers

```python
def test_firstaid_can_search_all_campers(s_firstaid):
    """firstAid can search all campers regardless of church/zone."""
    r = s_firstaid.get('/search?q=a')
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    # Should return results from multiple churches (camp-wide scope)
    churches = {item['camper']['churchId'] for item in data if 'camper' in item}
    assert len(churches) > 1, 'firstAid should see campers from multiple churches'
```

### test_firstaid_cannot_write_notes

```python
def test_firstaid_cannot_write_notes(s_firstaid, any_camper_id):
    """firstAid does not have note:write — POST /notes must return 403."""
    r = s_firstaid.post('/notes', json={'camperId': any_camper_id, 'body': 'Test note'})
    assert r.status_code == 403
```

### test_firstaid_cannot_admin_manage

```python
def test_firstaid_cannot_admin_manage(s_firstaid):
    """firstAid cannot access admin:manage routes."""
    r = s_firstaid.get('/accounts/users')
    assert r.status_code == 403

    r2 = s_firstaid.get('/admin/defaults')
    assert r2.status_code == 403
```

### test_camper_dto_includes_medications

```python
def test_camper_dto_includes_medications(s_firstaid, camper_with_medications_id):
    """CamperDto includes otherMedications, medicareNumber, parentRelation fields."""
    r = s_firstaid.get(f'/campers/{camper_with_medications_id}')
    assert r.status_code == 200
    dto = r.json()
    assert 'otherMedications' in dto, 'CamperDto must include otherMedications'
    assert 'medicareNumber' in dto, 'CamperDto must include medicareNumber'
    assert 'parentRelation' in dto, 'CamperDto must include parentRelation'
    assert 'consentMedical' in dto, 'CamperDto must include consentMedical'
    assert 'gender' in dto, 'CamperDto must include gender'
```

### test_medical_watch_returns_flagged_campers

```python
def test_medical_watch_returns_flagged_campers(s_firstaid):
    """GET /campers/medical returns only atCamp campers with a medical flag."""
    r = s_firstaid.get('/campers/medical')
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    for c in items:
        assert c['atCamp'] is True, 'Medical watch must only include atCamp campers'
        has_flag = (
            len(c.get('medicalConditions') or []) > 0 or
            len(c.get('dietaryRequirements') or []) > 0 or
            c.get('otherMedications') is not None
        )
        assert has_flag, f"Camper {c['id']} has no medical flag but was returned"
```

### test_firstaid_can_sign_out_camper

```python
def test_firstaid_can_sign_out_camper(s_firstaid, at_camp_camper_id):
    """firstAid has checkin:write and can use POST /attendance/sign-out."""
    r = s_firstaid.post('/attendance/sign-out', json={
        'camperId': at_camp_camper_id,
        'leaderName': 'First Aid Officer',
        'reason': 'Medical observation',
        'parentsMet': False,
    })
    assert r.status_code == 200
    # Sign them back in to leave test data clean
    s_firstaid.post('/attendance/sign-in', json={
        'camperId': at_camp_camper_id,
        'leaderName': 'First Aid Officer',
    })
```

### test_church_role_cannot_see_medical_watch

```python
def test_church_role_cannot_see_medical_watch(s_church):
    """church role does not have access to GET /campers/medical."""
    r = s_church.get('/campers/medical')
    # church has camper:read:sensitive but the route whitelist restricts to firstAid/director/admin
    assert r.status_code == 403
```

---

## Implementation order

1. `enums.ts` — add `'firstAid'` to `USER_ROLES`. Run `npm run typecheck`; it will now error on the missing `ROLE_PERMISSIONS` key.
2. `access-control.ts` — add `firstAid` entry to `ROLE_PERMISSIONS`; add case to `canAccessPerson`; add case to `canAccessChurch`.
3. `person.dto.ts` — widen `CamperDto` and update `toCamperDto`.
4. `person.service.ts` — add `listMedicalWatch`.
5. Controller + router — add `GET /campers/medical` route and `POST /campers/:id/reveal-medicare` route.
6. `account.schema.ts` — no manual change needed if `z.enum(USER_ROLES)` references the updated tuple.
7. `public/index.html` — `buildTabs`, `renderHomeFirstAid`, `renderSearchFirstAid`, `loadMedicalWatch`, `openCasualtyCard`, `revealMedicare`, `revealLeaderPhone`, `aRoleChange`/`roleOpts`/`leaderRoles` in `renderAdminAccounts`.
8. Run all 7 validation tests.
9. Seed or manually create a `firstAid` account in the local dev seed (`src/data/seed.ts`) for ongoing test convenience.
