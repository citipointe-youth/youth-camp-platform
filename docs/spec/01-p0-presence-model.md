# P0 — Presence Model Fix

> Priority: CRITICAL — must ship before P1 UX work and P4 presence views.
> Root: `/home/tlestrange/Projects/AI Exploration/Project 2 - App Updates/my-youth-camp-master`

---

## 1. Problem Statement

### The bug

`withCheckIn` in `src/services/person-lifecycle.ts` (line 51) delegates to
`applyCheckIn`, which was written to handle both daily session check-in **and**
attendance sign-in. The result is that a daily check-in (type `'out'`) calling
`applyCheckIn(person, 'out')` returns `{ lifecycle: 'checked_out', atCamp: false }` —
the same transition that a full camp departure should produce.

This means a leader marking a camper as "checked out" of the **afternoon session** on
a tablet inadvertently sets `atCamp = false` and transitions `lifecycle` to
`checked_out`. The camper immediately disappears from the daily roster on the next
render and is counted as departed in headcount figures.

### Failure scenarios

| Trigger | Wrong outcome |
|---|---|
| Leader taps "Check out" on the daily roster (PM session) | `atCamp` flips to `false`; camper vanishes from roster |
| Director views `totalAtCamp` on dashboard after PM session | Count drops by every PM-checked-out camper |
| `checkInsDue` is computed after someone has been daily-checked-out | Count is artificially low because the departed-looking person is now excluded from `allCampers` |
| A camper who was daily-checked-out tries to be checked in to the next session | `atCamp` is `false` so the server guard (once added) blocks the check-in and the UI shows an error |

### Affected files

| File | Current bad line(s) |
|---|---|
| `src/services/person-lifecycle.ts` | Lines 16–33, 50–58: `withCheckIn` / `applyCheckIn` — daily check-in type `'out'` calls the same transition as camp departure |
| `src/services/checkin.service.ts` | Line 81: `isCamper(p)` — uses lifecycle rather than `atCamp`, so departed-looking campers stay on roster |
| `src/services/person.service.ts` | Lines 248–254: `checkIn` — no guard; allows check-in on a person with `atCamp === false` |
| `src/services/dashboard.service.ts` | Line 138: `allCampers` filter uses `isCamper(p)` which includes `checked_out` (correct for total expected) but `checkInsDue` on line 167 also iterates `allCampers`, pulling in people who are fully departed |
| `public/index.html` | Line 712: `doCheck` — no error branch that preserves local state on 400; line 673: roster sourced from `st.roster` which reflects the broken server filter |

### What must NOT happen

- `withCheckIn` (daily session op) must never touch `lifecycle` or `atCamp`.
- `withSignEvent` (attendance / camp departure) is the only path that may write `atCamp` and advance the lifecycle beyond `arrived`.

---

## 2. Data Model

No schema change is needed. The two axes of presence are **already modelled separately**
on `Person` (`src/core/entities/person.ts`):

```
checkInHistory: CheckInEntry[]   // daily session record — append-only log
signOutHistory: SignOutEvent[]   // camp-presence events (arrival, departure, return)
atCamp: boolean                  // camp-presence flag — ONLY written by signEvent path
lifecycle: PersonLifecycle       // registered | arrived | checked_out | departed | cancelled
```

`checkInHistory` records which sessions a person attended on a given day. It has no
semantic relationship to `atCamp`. A person can be `atCamp: true, lifecycle: 'arrived'`
and have zero, one, or multiple `checkInHistory` entries — they are orthogonal facts.

`atCamp` is a derived convenience that mirrors the `signOutHistory` state machine:
- First `signEvent type='in'` (Day-1 arrival) sets `atCamp = true`.
- Subsequent `signEvent type='out'` (departure) sets `atCamp = false`.
- `signEvent type='in'` (return) sets `atCamp = true` again.

`isCamper()` (`src/core/entities/person.ts` line 118) tests `lifecycle ∈
{arrived, checked_out, departed}`. This is the right predicate for "has this person ever
arrived at camp?" — i.e., pre-camp filtering. It is NOT the right predicate for
"is this person physically at camp right now?" — that is `atCamp === true`.

The fix is entirely in the service/controller layer: change what `withCheckIn` writes,
add a guard in `checkIn`, and update every filter that currently uses `isCamper()` where
it should be using `atCamp === true`.

---

## 3. Service Layer Changes

### 3a. `person-lifecycle.ts` — new `withCheckIn`

`withCheckIn` must append the `CheckInEntry` to `checkInHistory` and update `updatedAt`,
but it must not call `applyCheckIn` and must not touch `lifecycle` or `atCamp`.

The daily session check-in is a **log append only**. Promotion from `registered` to
`arrived` is the exclusive responsibility of `withSignEvent` when `event.type === 'in'`
(attendance sign-in path).

**Old (lines 50–58):**

```typescript
/** Append a check-in entry and apply the resulting promotion in one immutable step. */
export function withCheckIn(person: Person, entry: CheckInEntry, now: string): Person {
  const next = applyCheckIn(person, entry.type);
  return {
    ...person,
    checkInHistory: [...person.checkInHistory, entry],
    lifecycle: next.lifecycle,
    atCamp: next.atCamp,
    updatedAt: now,
  };
}
```

**New:**

```typescript
/**
 * Append a daily session check-in entry immutably.
 *
 * This function records that a person checked in/out of a session.
 * It does NOT mutate lifecycle or atCamp — those are exclusively managed
 * by withSignEvent (attendance / camp-presence path).
 *
 * Day-1 first-arrival promotion (registered -> arrived) happens in
 * withSignEvent when event.type === 'in', NOT here.
 */
export function withCheckIn(person: Person, entry: CheckInEntry, now: string): Person {
  return {
    ...person,
    checkInHistory: [...person.checkInHistory, entry],
    updatedAt: now,
  };
}
```

`applyCheckIn` and the convenience wrappers `applySignOut` / `applySignIn` remain
unchanged — they are still used exclusively by `withSignEvent`.

`withSignEvent` is unchanged (lines 62–71). It correctly calls `applyCheckIn` to drive
the lifecycle/atCamp state machine.

### 3b. `checkin.service.ts` — `getSessionStatus` roster filter

**File:** `src/services/checkin.service.ts`, line 81.

The roster must show every person who is **physically at camp right now**
(`atCamp === true`). `isCamper(p)` is the wrong predicate because it also returns `true`
for `lifecycle === 'checked_out'` (fully departed) and `lifecycle === 'departed'`.

**Old (line 81):**

```typescript
const scoped = allPeople.filter((p) => isCamper(p) && canAccessPerson(actor, p));
```

**New:**

```typescript
const scoped = allPeople.filter((p) => p.atCamp && canAccessPerson(actor, p));
```

The `isCamper` import on line 6 can be removed from this file if it is no longer used
elsewhere in `checkin.service.ts` (it is not — the only usage was this line).

### 3c. `person.service.ts` — `checkIn` guard

**File:** `src/services/person.service.ts`, lines 248–254.

`checkIn` must throw `BadRequestError` if the person is not currently at camp
(`atCamp === false`). This catches the case where a client attempts to record a daily
session check-in for someone who has not arrived or has fully departed.

The guard does **not** apply to `signEvent` — that method is precisely the one used
for arrival (promoting `registered → arrived`) and departure, so it must be reachable
regardless of `atCamp`.

**Old (lines 248–254):**

```typescript
async checkIn(actor, personId, entry) {
  assertCan(actor, 'checkin:write');
  const person = await getOwned(actor, personId);
  const full: CheckInEntry = { ...entry, id: newId('ci') };
  // withCheckIn applies the D2 promotion (registered → arrived on first 'in').
  return repo.save(withCheckIn(person, full, nowISO()));
},
```

**New:**

```typescript
async checkIn(actor, personId, entry) {
  assertCan(actor, 'checkin:write');
  const person = await getOwned(actor, personId);
  // Guard: daily session check-in requires the person to be physically at camp.
  // Day-1 first-arrival goes through signEvent (attendance sign-in), not here.
  if (!person.atCamp) {
    throw new BadRequestError('Cannot check in a person who is not currently at camp');
  }
  const full: CheckInEntry = { ...entry, id: newId('ci') };
  return repo.save(withCheckIn(person, full, nowISO()));
},
```

The comment about "D2 promotion" is removed because `withCheckIn` no longer performs
any promotion.

### 3d. `dashboard.service.ts` — `checkInsDue` and `totalAtCamp`

**File:** `src/services/dashboard.service.ts`, lines 138–173.

**`totalAtCamp` — self-corrects for free**

Line 139 already computes `totalAtCamp` correctly:

```typescript
const totalAtCamp = allCampers.filter((p) => p.atCamp).length;
```

Once `withCheckIn` no longer writes `atCamp`, `totalAtCamp` naturally stays stable
across session check-ins. No code change is needed here — the fix to `withCheckIn` is
sufficient.

**`checkInsDue` — must count over `atCamp === true` only**

`allCampers` on line 138 is filtered by `isCamper(p)`, which includes `lifecycle ===
'checked_out'` (fully departed) and `lifecycle === 'departed'`. These should not
contribute to `checkInsDue` — a departed person is not due to check in to any session.

**Old (line 138):**

```typescript
const allCampers = allPersons.filter((p) => isCamper(p) && canAccessPerson(actor, p));
```

**New:**

```typescript
// totalExpected: everyone who has ever arrived (isCamper), scoped to actor.
// atCampNow: the subset physically present — the denominator for checkInsDue.
const allCampers = allPersons.filter((p) => isCamper(p) && canAccessPerson(actor, p));
const atCampNow  = allCampers.filter((p) => p.atCamp);
```

Then update the `checkInsDue` computation (lines 167–173) to iterate `atCampNow`
instead of `allCampers`:

**Old (lines 167–173):**

```typescript
const checkInsDue = currentSession
  ? allCampers.filter((p) => {
      const entries = p.checkInHistory.filter((e) => e.sessionId === currentSession.id);
      const last = entries[entries.length - 1];
      return last?.type !== 'in';
    }).length
  : 0;
```

**New:**

```typescript
const checkInsDue = currentSession
  ? atCampNow.filter((p) => {
      const entries = p.checkInHistory.filter((e) => e.sessionId === currentSession.id);
      const last = entries[entries.length - 1];
      return last?.type !== 'in';
    }).length
  : 0;
```

`totalExpected` remains `allCampers.length` — it counts everyone who has arrived at
camp (including those currently departed), which is the correct denominator for the
"expected headcount" figure shown to directors.

---

## 4. API Changes

### `POST /checkin` — 400 for non-atCamp person

When `checkIn` in `person.service.ts` throws `BadRequestError`, the Express error
handler in `src/api/http/` serialises it to:

```json
HTTP 400
{
  "code": "BAD_REQUEST",
  "message": "Cannot check in a person who is not currently at camp"
}
```

This is the standard `BadRequestError` shape (`statusCode: 400, code: 'BAD_REQUEST'`
— see `src/core/errors/app-error.ts` line 17). No new error class is needed.

The controller (`src/api/controllers/checkin.controller.ts`) requires no change — it
already lets service errors propagate to the middleware.

Clients should treat this 400 as a "person no longer at camp" signal and refresh the
roster rather than retrying.

---

## 5. SPA Changes

**File:** `public/index.html`

### `doCheck` — error handling for the new 400

**Current (line 712):**

```javascript
async function doCheck(camperId, type) {
  try {
    await api('/checkin', { method: 'POST', body: { camperId, sessionId: SEL_SESSION, type } });
    toast(type === 'in' ? 'Checked in ✓' : 'Checked out');
    await RENDER.checkin();
  } catch(e) {
    toast(e.message);
  }
}
```

The current catch block shows the error message as a toast but does not refresh the
roster. If a user taps check-in on a stale row (person has since departed), the roster
will be out of date and subsequent taps will keep 400-ing. The fix is to trigger a
roster refresh on any error from `POST /checkin` so the stale row is removed.

**New:**

```javascript
async function doCheck(camperId, type) {
  try {
    await api('/checkin', { method: 'POST', body: { camperId, sessionId: SEL_SESSION, type } });
    toast(type === 'in' ? 'Checked in ✓' : 'Checked out');
  } catch(e) {
    // A 400 means the person is no longer at camp (departed since last load).
    // Refresh the roster so the stale row disappears.
    toast(e.message || 'Check-in failed — refreshing roster');
  }
  // Always re-render: success confirms the write; error may indicate stale data.
  await RENDER.checkin();
}
```

The move of `RENDER.checkin()` outside the try/catch ensures a roster refresh on both
success and error paths. This is a minimal change; the P1 spec will replace this with
an optimistic-update + offline-queue pattern.

### Roster filter — self-corrects

The daily check-in roster (`RENDER.checkin`, lines 665–708) is populated from
`st.roster`, which is the `RosterEntry[]` array returned by `GET
/checkin/sessions/:id/status`. Once `getSessionStatus` filters on `p.atCamp` instead
of `isCamper(p)`, the roster will naturally exclude departed campers without any SPA
code change.

`totalCount` and `checkedInCount` in the status response are also derived from the
filtered `scoped` array, so the "N not yet checked in" counter will also self-correct.

No SPA changes are needed for the roster filter — the change is entirely server-side.

---

## 6. Updated Unit Tests

These are complete `vitest` test blocks to replace and extend the existing
`withCheckIn` and `withSignEvent` sections in
`src/services/person-lifecycle.test.ts`.

The existing `describe('withCheckIn')` block tests that `withCheckIn` promotes
`registered → arrived`. **Those tests must be updated** — after this fix, `withCheckIn`
must NOT promote. Replace the entire `describe('withCheckIn')` block and add new
`describe('withSignEvent')` cases covering the atCamp invariants.

```typescript
// -----------------------------------------------------------------------
// basePerson helper — shared across all immutable-function tests
// -----------------------------------------------------------------------
function basePerson(over: Partial<Person> = {}): Person {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: 'p1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    gender: 'female',
    kind: 'youth',
    churchId: 'c1',
    churchName: 'Victory',
    zone: 'Yellow',
    medicalConditions: [],
    dietaryRequirements: [],
    consents: {
      medical: { granted: false, timestamp: null },
      media: { granted: false, timestamp: null },
      supervision: { granted: false, timestamp: null },
    },
    paymentStatus: 'unpaid',
    lifecycle: 'registered',
    atCamp: false,
    checkInHistory: [],
    signOutHistory: [],
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

// -----------------------------------------------------------------------
// withCheckIn — DAILY SESSION LOG ONLY, no lifecycle/atCamp mutation
// -----------------------------------------------------------------------
describe('withCheckIn — append-only, no presence mutation', () => {
  const sessionEntry: CheckInEntry = {
    id: 'ci1',
    sessionId: 's1',
    sessionLabel: 'Wed AM',
    type: 'in',
    leaderId: 'u1',
    timestamp: '2026-07-01T08:00:00.000Z',
  };

  it('appends the entry and stamps updatedAt', () => {
    const p = basePerson({ lifecycle: 'arrived', atCamp: true });
    const next = withCheckIn(p, sessionEntry, '2026-07-01T08:00:01.000Z');
    expect(next.checkInHistory).toHaveLength(1);
    expect(next.checkInHistory[0]).toBe(sessionEntry);
    expect(next.updatedAt).toBe('2026-07-01T08:00:01.000Z');
  });

  // THE KEY FIX: registered person daily check-in must NOT change atCamp or lifecycle
  it('withCheckIn on registered person: atCamp stays false, lifecycle stays registered, entry IS appended', () => {
    const p = basePerson({ lifecycle: 'registered', atCamp: false });
    const next = withCheckIn(p, sessionEntry, '2026-07-01T08:00:01.000Z');
    expect(next.atCamp).toBe(false);
    expect(next.lifecycle).toBe('registered');
    expect(next.checkInHistory).toHaveLength(1);
  });

  // THE KEY FIX: daily check-OUT on an arrived person must NOT set atCamp to false
  it('withCheckIn type=out on arrived person: atCamp stays TRUE, lifecycle stays arrived', () => {
    const outEntry: CheckInEntry = {
      id: 'ci2',
      sessionId: 's1',
      sessionLabel: 'Wed PM',
      type: 'out',
      leaderId: 'u1',
      timestamp: '2026-07-01T14:00:00.000Z',
    };
    const p = basePerson({ lifecycle: 'arrived', atCamp: true });
    const next = withCheckIn(p, outEntry, '2026-07-01T14:00:01.000Z');
    // atCamp must remain true — daily checkout is not a camp departure
    expect(next.atCamp).toBe(true);
    expect(next.lifecycle).toBe('arrived');
    expect(next.checkInHistory).toHaveLength(1);
    expect(next.checkInHistory[0]).toBe(outEntry);
  });

  it('does not mutate the input person', () => {
    const p = basePerson({ lifecycle: 'arrived', atCamp: true });
    withCheckIn(p, sessionEntry, '2026-07-01T08:00:01.000Z');
    expect(p.checkInHistory).toHaveLength(0);
    expect(p.lifecycle).toBe('arrived');
    expect(p.atCamp).toBe(true);
  });
});

// -----------------------------------------------------------------------
// withSignEvent — ONLY path that mutates lifecycle/atCamp
// -----------------------------------------------------------------------
describe('withSignEvent — lifecycle and atCamp transitions', () => {
  // THE KEY FIX: sign-OUT (full camp departure) sets atCamp false
  it('withSignEvent type=out: atCamp becomes false, lifecycle becomes checked_out', () => {
    const p = basePerson({ lifecycle: 'arrived', atCamp: true });
    const ev: SignOutEvent = {
      id: 'so1',
      type: 'out',
      leaderName: 'Leader',
      authorId: 'u1',
      timestamp: '2026-07-01T15:00:00.000Z',
    };
    const next = withSignEvent(p, ev, '2026-07-01T15:00:01.000Z');
    expect(next.atCamp).toBe(false);
    expect(next.lifecycle).toBe('checked_out');
    expect(next.signOutHistory).toHaveLength(1);
    expect(p.signOutHistory).toHaveLength(0); // input untouched
  });

  // Return from sign-out: atCamp comes back true
  it('withSignEvent type=in on checked_out: atCamp becomes true, lifecycle becomes arrived', () => {
    const p = basePerson({ lifecycle: 'checked_out', atCamp: false });
    const ev: SignOutEvent = {
      id: 'si1',
      type: 'in',
      leaderName: 'Leader',
      authorId: 'u1',
      timestamp: '2026-07-02T09:00:00.000Z',
    };
    const next = withSignEvent(p, ev, '2026-07-02T09:00:01.000Z');
    expect(next.atCamp).toBe(true);
    expect(next.lifecycle).toBe('arrived');
    expect(next.signOutHistory).toHaveLength(1);
  });

  it('Day-1 arrival via sign-in: registered -> arrived, atCamp becomes true', () => {
    const p = basePerson({ lifecycle: 'registered', atCamp: false });
    const ev: SignOutEvent = {
      id: 'si2',
      type: 'in',
      leaderName: 'Leader',
      authorId: 'u1',
      timestamp: '2026-07-01T08:00:00.000Z',
    };
    const next = withSignEvent(p, ev, '2026-07-01T08:00:01.000Z');
    expect(next.lifecycle).toBe('arrived');
    expect(next.atCamp).toBe(true);
  });
});
```

---

## 7. Validation Tests

These are Python functions using `requests` for the live verification harness
(`docs/verification/`). They test the P0 invariants against a running server
(default `http://localhost:4200`).

```python
import requests

BASE = "http://localhost:4200"

def _login(username="director", password="demo1234"):
    r = requests.post(f"{BASE}/auth/login", json={"username": username, "password": password})
    r.raise_for_status()
    return r.json()["token"]


def _get_current_session(token):
    r = requests.get(
        f"{BASE}/checkin/sessions/current",
        headers={"Authorization": f"Bearer {token}"}
    )
    r.raise_for_status()
    return r.json()


def _get_session_status(token, session_id):
    r = requests.get(
        f"{BASE}/checkin/sessions/{session_id}/status",
        headers={"Authorization": f"Bearer {token}"}
    )
    r.raise_for_status()
    return r.json()


def _get_home(token):
    r = requests.get(f"{BASE}/home", headers={"Authorization": f"Bearer {token}"})
    r.raise_for_status()
    return r.json()


def test_daily_checkout_does_not_remove_from_headcount():
    """
    A daily session check-OUT must not decrease totalAtCamp on the dashboard.

    Steps:
    1. Log in as director and record the baseline totalAtCamp.
    2. Find a camper who is currently checked in (checkedIn=true on roster).
    3. POST /checkin with type='out' (daily session checkout).
    4. Assert totalAtCamp is unchanged.
    5. Assert the camper still appears on the roster (atCamp still true).
    """
    token = _login()
    baseline = _get_home(token)
    assert baseline["mode"] == "at-camp", "App must be in at-camp mode for this test"
    before_total = baseline["totalAtCamp"]

    session = _get_current_session(token)
    assert session, "No current session — configure schedule with a check-in point"

    status = _get_session_status(token, session["id"])
    checked_in_rows = [r for r in status["roster"] if r["checkedIn"]]
    assert checked_in_rows, "Need at least one checked-in camper to test check-out"

    target = checked_in_rows[0]
    r = requests.post(
        f"{BASE}/checkin",
        json={"camperId": target["camperId"], "sessionId": session["id"], "type": "out"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"

    after = _get_home(token)
    assert after["totalAtCamp"] == before_total, (
        f"FAIL: daily checkout changed totalAtCamp from {before_total} to {after['totalAtCamp']}"
    )

    # Camper must still appear on the roster
    new_status = _get_session_status(token, session["id"])
    camper_row = next(
        (r for r in new_status["roster"] if r["camperId"] == target["camperId"]), None
    )
    assert camper_row is not None, (
        f"FAIL: camper {target['camperId']} disappeared from roster after daily check-out"
    )
    print(f"PASS: daily check-out left totalAtCamp={after['totalAtCamp']} and camper on roster")


def test_departed_camper_not_on_roster():
    """
    A fully departed camper (atCamp=false via attendance sign-out) must NOT appear
    on the daily check-in roster.

    Steps:
    1. Sign out a camper via POST /attendance/sign-out.
    2. Fetch the roster for the current session.
    3. Assert the signed-out camper is absent from the roster.
    """
    token = _login()
    session = _get_current_session(token)
    assert session, "No current session configured"

    status = _get_session_status(token, session["id"])
    assert status["roster"], "Roster is empty — seed at least one at-camp camper"

    target_camper_id = status["roster"][0]["camperId"]
    before_count = len(status["roster"])

    r = requests.post(
        f"{BASE}/attendance/sign-out",
        json={"camperId": target_camper_id, "reason": "P0 validation test", "leaderName": "Test"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert r.status_code == 200, f"Sign-out failed: {r.status_code} {r.text}"

    new_status = _get_session_status(token, session["id"])
    camper_ids = [r["camperId"] for r in new_status["roster"]]
    assert target_camper_id not in camper_ids, (
        f"FAIL: departed camper {target_camper_id} still appears on roster"
    )
    assert len(new_status["roster"]) == before_count - 1, (
        f"FAIL: roster count did not decrease (was {before_count}, now {len(new_status['roster'])})"
    )
    print(f"PASS: departed camper absent from roster (roster: {before_count} -> {len(new_status['roster'])})")


def test_checkin_blocked_for_non_atcamp():
    """
    POST /checkin must return 400 for a person who is not atCamp.

    Steps:
    1. Sign out a camper via attendance (sets atCamp=false).
    2. Attempt a daily session check-in for that camper.
    3. Assert the server returns HTTP 400 with code=BAD_REQUEST.
    """
    token = _login()
    session = _get_current_session(token)
    assert session, "No current session configured"

    status = _get_session_status(token, session["id"])
    assert status["roster"], "Roster is empty — seed at least one at-camp camper"

    target_camper_id = status["roster"][0]["camperId"]

    # Depart the camper via attendance
    r = requests.post(
        f"{BASE}/attendance/sign-out",
        json={"camperId": target_camper_id, "reason": "P0 guard test", "leaderName": "Test"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert r.status_code == 200, f"Pre-condition sign-out failed: {r.status_code} {r.text}"

    # Attempt daily check-in on departed camper — must be blocked
    r = requests.post(
        f"{BASE}/checkin",
        json={"camperId": target_camper_id, "sessionId": session["id"], "type": "in"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert r.status_code == 400, (
        f"FAIL: expected 400 for non-atCamp check-in, got {r.status_code}: {r.text}"
    )
    body = r.json()
    assert body.get("code") == "BAD_REQUEST", f"FAIL: expected code=BAD_REQUEST, got {body}"
    print(f"PASS: check-in for departed camper correctly blocked with 400 BAD_REQUEST")
```

---

## 8. Sequencing Note

This P0 fix is a prerequisite for the following work streams:

**P1 — On-Ground UX** (`docs/spec/02-p1-onground-ux.md`)
- The optimistic-tap check-in with offline queue relies on a stable `atCamp` flag to
  know whether to show a row at all. If `withCheckIn` is still mutating `atCamp`, the
  optimistic state flip and server reconciliation will produce contradictory results
  (locally the row is present; the server kills it via the wrong atCamp write).
- The "Still need (N) / Done (M)" visual sections in the roster derive their counts
  from `checkInsDue`. If `checkInsDue` counts over departed campers (as it does before
  this fix), those section counts will be wrong on first render.

**P4 — First-Aid Role** (`docs/spec/04-p4-firstaid-role.md`)
- The Medical Watch list is defined as "all `atCamp` campers with any medical flag". If
  `atCamp` is being corrupted by daily check-out, Medical Watch will lose campers who
  are physically present but have been daily-checked-out — a patient-safety issue.
- The first-aid casualty card shows `atCamp` status. The P4 spec depends on this flag
  being authoritative.

**Recommended merge order:**
1. This P0 fix (server-side `withCheckIn`, `checkin.service`, `person.service`,
   `dashboard.service`, SPA `doCheck`).
2. Run the full test suite (`npm run test`) and the three Python validation functions
   against a local seed instance to confirm green before pushing to `master`.
3. P1 UX work may begin on a feature branch immediately after this lands on `master`.
4. P4 first-aid role work may begin in parallel with P1 after P0 lands.
