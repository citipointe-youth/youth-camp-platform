# Part 1 — On-ground & Oversight UX

## 1. Overview and motivation

The current daily check-in screen (lines 665–712 of `public/index.html`) works but has
several pain points for at-camp use:

- **Two fetches per render.** `renderCheckin` fires both `/checkin/sessions/:id/status`
  and `/campers` in parallel on every call, including after every single tap. With 400+
  campers, the `/campers` response is large and slow on a congested camp Wi-Fi network.
  The only fields needed from it (`gender`, `grade`) can be baked into the roster DTO.
- **Full re-render on every check-in tap.** `doCheck` awaits the POST then immediately
  calls `RENDER.checkin()`, which fires both fetches again and re-renders the whole list.
  This is visually jarring and creates a ~1–2 second dead window per tap.
- **No offline resilience.** If the network drops mid-session, taps are silently lost.
- **Flat list with no visual grouping.** "Who still needs checking in?" requires scanning
  the whole list, which is sorted but has no clear section break.
- **No undo path.** A mis-tap produces a permanent state change with no recovery.
- **No confirm on check-OUT.** The "✓ in" button (which undoes a check-in) fires
  immediately, with no confirmation, which is error-prone.
- **Search is buried in a separate tab.** On-ground staff frequently need to jump from
  the roster to a quick name search (e.g. to find a late-arriving camper). There is no
  shortcut visible.
- **Phone numbers are not tappable.** Contact numbers shown on camper detail cards are
  plain text; on mobile they should be `tel:` links.
- **Director/zone-leader home has no at-a-glance progress.** The home screen shows a
  generic hero and tiles; there is no per-zone or per-church check-in progress visible.
- **Urgent notices are passive.** They appear in the home-screen notices list alongside
  normal notices; an operator may miss a high-priority alert while on another screen.
- **Church/leader role "My day" experience is missing.** When a church leader logs in,
  they see the same generic home as a director. A "My day" summary (their church's
  check-in count, today's schedule, next session) is more useful.

All changes in this spec operate on the existing architecture:
`PersonService` + `IPersonRepository` + `CheckInService`. No new endpoints are
required for sections 2–6. Sections 7–9 use the existing `/status` and `/home` data.

---

## 2. Roster DTO enrichment

### 2a. New RosterEntry fields

**File:** `src/api/dto/person.dto.ts`

Add three fields to the `RosterEntry` interface and populate them in `toRosterEntry()`:

```typescript
// Current (lines 74-82):
export interface RosterEntry {
  camperId: string;
  firstName: string;
  lastName: string;
  church: string;
  zone: string;
  checkedIn: boolean;
  lastEntry: 'in' | 'out' | null;
}

// After change:
export interface RosterEntry {
  camperId: string;
  firstName: string;
  lastName: string;
  church: string;
  zone: string;
  checkedIn: boolean;
  lastEntry: 'in' | 'out' | null;
  gender: Person['gender'];          // 'male' | 'female' | 'unspecified'
  grade: Person['grade'];            // number | null
  medicalFlag: boolean;              // true if medicalConditions.length > 0
}
```

Updated `toRosterEntry` (replace lines 152–164):

```typescript
export function toRosterEntry(p: Person, sessionId: string): RosterEntry {
  const sessionEntries = p.checkInHistory.filter((e) => e.sessionId === sessionId);
  const last = sessionEntries[sessionEntries.length - 1] ?? null;
  return {
    camperId: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    church: p.churchName,
    zone: p.zone,
    checkedIn: last?.type === 'in',
    lastEntry: last?.type ?? null,
    gender: p.gender,
    grade: p.grade ?? null,
    medicalFlag: p.medicalConditions.length > 0,
  };
}
```

No other server files need changing. `getSessionStatus` in `checkin.service.ts` already
maps `allPeople` through `toRosterEntry`; it will automatically include the new fields.

The `SessionStatus` interface and `CheckInService` contract are unchanged — the DTO
fields are additive and backwards-compatible.

### 2b. Updated getSessionStatus — no longer needs /campers annotation

`checkin.service.ts` line 82 already produces the roster via `toRosterEntry`. After the
DTO change, `SessionStatus.roster` carries `gender`, `grade`, and `medicalFlag` directly.
No changes to service logic are required; the mapping is entirely in the DTO layer.

The service's RBAC and `atCamp` filter (locked decision: `getSessionStatus` already
filters on `isCamper(p)`, and the attendance sign-in controls `atCamp`) are unaffected.

### 2c. SPA: remove /campers piggyback from renderCheckin

**File:** `public/index.html`, replace lines 671–673.

**Current (broken two-fetch pattern):**

```javascript
const [st,campers]=await Promise.all([api('/checkin/sessions/'+SEL_SESSION+'/status'),api('/campers').catch(()=>[])]);
const cmap={};(campers||[]).forEach(c=>{cmap[c.id]={gender:c.gender,grade:c.grade};});
const roster=(st.roster||[]).map(r=>({id:r.camperId,name:(r.firstName+' '+r.lastName).trim(),church:r.church,zone:r.zone,present:!!r.checkedIn,gender:(cmap[r.camperId]||{}).gender,grade:(cmap[r.camperId]||{}).grade}));
```

**Replacement (single-fetch, uses enriched DTO):**

```javascript
const st = await api('/checkin/sessions/'+SEL_SESSION+'/status');
const roster = (st.roster||[]).map(r=>({
  id: r.camperId,
  name: (r.firstName+' '+r.lastName).trim(),
  church: r.church,
  zone: r.zone,
  present: !!r.checkedIn,
  gender: r.gender,
  grade: r.grade,
  medicalFlag: !!r.medicalFlag,
}));
```

The remainder of `renderCheckin` (filters, sort, HTML generation) is unchanged by this
substitution. The gender/grade filters already work against `c.gender`/`c.grade` —
they will now populate from the roster itself rather than the `/campers` payload.

---

## 3. Optimistic tap + offline queue

### 3a. Design

**State variables** — add to the `STATE` block near line 261:

```javascript
// Offline check-in queue
const CHECKIN_QUEUE = [];   // [{camperId, sessionId, type, ts}]
let _draining = false;
let _onlineHandlerAdded = false;
```

**Queue mechanics:**

- On tap, `doCheck` immediately flips the row's local visual state and pushes an entry
  onto `CHECKIN_QUEUE`, then calls `drainQueue()`.
- `drainQueue()` is re-entrant-safe via `_draining`. It works through the queue
  sequentially (oldest first), POSTing each entry to `/checkin`. On success the entry
  is removed. On network failure or non-4xx HTTP error it stops and schedules a retry
  via `setTimeout` with exponential backoff (1 s, 2 s, 4 s, max 30 s). On 4xx (bad
  request, e.g. wrong session ID) it discards the entry and logs a toast so the failure
  is visible.
- `window.addEventListener('online', drainQueue)` ensures queued writes flush when
  connectivity resumes. The handler is added once at startup.

**Per-row sync indicator** — a small dot appended to each row:

- `syncing` (amber spinner dot): entry is in the queue and `_draining===true`.
- `synced` (green dot): POST returned 2xx within this session.
- No dot: default state (never tapped this session, or indicator already faded).

The dot fades out after 2 seconds in the `synced` state via a CSS transition. It is
implemented as an inline `<span>` inside the row rather than a DOM-query post-render
approach, so re-renders naturally reconstruct it based on queue state.

### 3b. Complete new doCheck function and queue/drain mechanism

Replace `doCheck` (line 712) and add the queue helpers immediately before
`RENDER.checkin` (line 665):

```javascript
// ---- Offline queue -----------------------------------------------------------
if(!_onlineHandlerAdded){window.addEventListener('online',()=>drainQueue());_onlineHandlerAdded=true;}

function _queueEntry(camperId,sessionId,type){
  // Deduplicate: if a queued entry for the same (camperId,sessionId) already exists,
  // replace it so we never POST a redundant flip.
  const idx=CHECKIN_QUEUE.findIndex(e=>e.camperId===camperId&&e.sessionId===sessionId);
  const entry={camperId,sessionId,type,ts:Date.now(),retryDelay:1000,retries:0};
  if(idx>=0)CHECKIN_QUEUE.splice(idx,1,entry);
  else CHECKIN_QUEUE.push(entry);
}

async function drainQueue(){
  if(_draining||CHECKIN_QUEUE.length===0)return;
  _draining=true;
  _updateSyncDots();
  while(CHECKIN_QUEUE.length>0){
    const entry=CHECKIN_QUEUE[0];
    try{
      await api('/checkin',{method:'POST',body:{camperId:entry.camperId,sessionId:entry.sessionId,type:entry.type}});
      CHECKIN_QUEUE.shift();
      _markSynced(entry.camperId);
    }catch(e){
      // 4xx = permanent failure — drop entry so we don't block the queue
      const is4xx=e.message&&/^[Rr]equest failed \(4/.test(e.message);
      if(is4xx){CHECKIN_QUEUE.shift();toast('Sync failed: '+e.message);}
      else{
        // Transient — back off and retry
        entry.retries=(entry.retries||0)+1;
        entry.retryDelay=Math.min((entry.retryDelay||1000)*2,30000);
        setTimeout(drainQueue,entry.retryDelay);
      }
      break;
    }
  }
  _draining=false;
  _updateSyncDots();
}

// Optimistic local state: mirrors what the server will see once queue is drained.
// Key: camperId; value: 'in'|'out' if there is a queued entry, else undefined.
function _optimisticState(camperId){
  const q=CHECKIN_QUEUE.find(e=>e.camperId===camperId);
  return q?q.type:null;
}

function _updateSyncDots(){
  CHECKIN_QUEUE.forEach(e=>{
    const dot=document.getElementById('dot_'+e.camperId);
    if(dot){dot.className='sync-dot '+((_draining&&CHECKIN_QUEUE[0]&&CHECKIN_QUEUE[0].camperId===e.camperId)?'syncing':'pending');}
  });
}

function _markSynced(camperId){
  const dot=document.getElementById('dot_'+camperId);
  if(dot){dot.className='sync-dot synced';setTimeout(()=>{if(dot&&dot.className==='sync-dot synced')dot.style.opacity='0';},2000);}
}

// Called from the whole-row tap target (onclick on .row).
async function doCheck(camperId,type,event){
  if(event)event.stopPropagation();
  if(type==='out'){await confirmCheckOut(camperId);return;}
  _performCheck(camperId,'in');
}

function _performCheck(camperId,type){
  _queueEntry(camperId,SEL_SESSION,type);
  // Flip local row state immediately
  const row=document.getElementById('row_'+camperId);
  if(row){
    row.classList.toggle('checked',type==='in');
    const btn=row.querySelector('.ci-btn');
    if(btn){
      if(type==='in'){btn.className='btn alt sm ci-btn';btn.textContent='✓ in';btn.setAttribute('onclick',"doCheck('"+camperId+"','out',event)");}
      else{btn.className='btn sm ci-btn';btn.textContent='Check in';btn.setAttribute('onclick',"doCheck('"+camperId+"','in',event)");}
    }
  }
  // Move row between sections
  _moveRowBetweenSections(camperId,type);
  // Update counters
  _refreshCounters();
  drainQueue();
  _showUndoToast(camperId,type);
}
```

**CSS additions** (add to the `<style>` block near line 15):

```css
.sync-dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-left:6px;flex:none;transition:opacity .6s;}
.sync-dot.pending{background:#f59e0b;}
.sync-dot.syncing{background:#2563eb;animation:pulse .8s ease-in-out infinite;}
.sync-dot.synced{background:#16a34a;}
@keyframes pulse{0%,100%{opacity:1;}50%{opacity:.4;}}
```

### 3c. Undo toast — complete code

The undo toast gives the user 4 seconds to reverse a check-in (not check-out, which
requires confirmation instead).

```javascript
let _undoTimer=null, _undoCamperId=null, _undoType=null;

function _showUndoToast(camperId,type){
  if(type!=='in')return; // check-out uses confirm modal instead
  _undoCamperId=camperId;_undoType=type;
  clearTimeout(_undoTimer);
  const t=document.getElementById('toast');
  t.innerHTML='Checked in <button onclick="undoCheck()" style="margin-left:10px;background:rgba(255,255,255,.2);border:none;color:#fff;border-radius:6px;padding:2px 9px;font-size:.78rem;font-weight:700;cursor:pointer">Undo</button>';
  t.classList.add('show');
  _undoTimer=setTimeout(()=>{t.classList.remove('show');_undoCamperId=null;},4000);
}

function undoCheck(){
  if(!_undoCamperId)return;
  clearTimeout(_undoTimer);
  document.getElementById('toast').classList.remove('show');
  _performCheck(_undoCamperId,'out');
  _undoCamperId=null;
}
```

The existing `toast(m)` function (line 296) only accepts a string. The undo toast
uses direct DOM manipulation on `#toast` so the "Undo" button can live inside the
toast element. Both functions share the same `#toast` element; `toast()` still works
for pure-string cases (error messages, "Checked out" confirmation).

### 3d. Confirm-before-check-OUT modal — complete code

Check-out is destructive (it marks a camper as not present for the session). Require
an explicit confirmation.

```javascript
function confirmCheckOut(camperId){
  const row=document.getElementById('row_'+camperId);
  const name=row?row.querySelector('.nm')?.textContent:'this camper';
  modal(`<h3>Check out ${esc(name)}?</h3>
    <p style="font-size:.84rem;color:#475569;margin:8px 0 18px">This will mark them as not present for this session.</p>
    <button class="btn red" onclick="closeModal();_performCheck('${camperId}','out')">Yes, check out</button>
    <button class="btn ghost" style="margin-top:8px" onclick="closeModal()">Cancel</button>`);
}
```

The modal uses the existing `.modal` / `.sheet` overlay (line 203). The "Yes, check
out" button calls `_performCheck` which goes through the same optimistic + queue path
as a check-in. No separate code path needed.

---

## 4. Two-pile roster visual

### 4a. "Still need (N)" header + collapsible "Done (M)" section

**Updated renderCheckin HTML generation** — replace the `list.map(...)` block (lines
702–706) with a two-section layout.

The sort on line 685 (`list.sort((a,b)=>a.present-b.present)`) keeps unchecked first;
we split on that boundary:

```javascript
const due    = list.filter(c => !c.present);
const done   = list.filter(c =>  c.present);

function rowHtml(c){
  const syncDot = CHECKIN_QUEUE.find(e=>e.camperId===c.id)
    ? `<span class="sync-dot pending" id="dot_${c.id}"></span>`
    : `<span class="sync-dot" id="dot_${c.id}" style="opacity:0"></span>`;
  const medBadge = c.medicalFlag
    ? `<span style="font-size:.58rem;font-weight:800;background:#fde2e1;color:#b91c1c;border-radius:4px;padding:1px 5px;margin-left:4px">MED</span>`
    : '';
  return `<div class="row ${c.present?'checked':''}" id="row_${c.id}"
      onclick="doCheck('${c.id}','${c.present?'out':'in'}',event)">
    <div class="av ${esc(c.gender||'')}">${initials(c.name)}</div>
    <div style="flex:1;min-width:0">
      <div class="nm">${esc(c.name)}${medBadge}</div>
      <div class="sub">${esc(c.church||c.zone)}${c.grade?' · Yr '+c.grade:''}</div>
    </div>
    ${syncDot}
    <button class="btn ghost sm" onclick="notePrompt('${c.id}','${esc(c.name)}',event)">＋ note</button>
    ${c.present
      ? `<button class="btn alt sm ci-btn" onclick="doCheck('${c.id}','out',event)">✓ in</button>`
      : `<button class="btn sm ci-btn" onclick="doCheck('${c.id}','in',event)">Check in</button>`}
  </div>`;
}

const dueHtml = due.length > 0
  ? `<div class="h3" style="color:var(--warn)">Still need (${due.length})</div>
     ${due.map(rowHtml).join('')}`
  : '';

const doneHtml = done.length > 0
  ? `<details ${due.length===0?'open':''} style="margin-top:4px">
       <summary class="h3" style="cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center">
         <span>Done (${done.length})</span>
         <span style="font-size:.7rem;font-weight:600;color:var(--blue)">${due.length===0?'collapse ▲':'expand ▼'}</span>
       </summary>
       ${done.map(rowHtml).join('')}
     </details>`
  : '';
```

The `<details>` element is collapsed by default while anyone remains unchecked; it opens
automatically when `dueShown===0` (the `open` attribute is set conditionally).

The whole-row `onclick` on `.row` handles both check-in and check-out; the explicit
`ci-btn` buttons use `event.stopPropagation()` (handled inside `doCheck`) so the click
doesn't fire twice.

### 4b. Completion banner when dueShown===0

Replace the existing `pill.ok` span in the summary card with a full-width banner:

```javascript
const summaryBottom = dueShown === 0
  ? `<div style="margin-top:8px;background:#e7f7ec;border:1px solid #bbf7d0;border-radius:10px;
        padding:10px 13px;font-size:.84rem;font-weight:700;color:#15803d;text-align:center">
       All ${list.length} checked in for ${esc(label)} ✓
     </div>`
  : `<div style="text-align:right">
       <div style="font-weight:800;font-size:1.4rem;line-height:1;color:#b45309">${dueShown}</div>
       <div class="sub" style="font-size:.68rem">not yet checked in${list.length!==roster.length?' (filtered)':''}</div>
     </div>`;
```

The summary card (currently line 698–700) becomes:

```javascript
`<div class="card" style="display:flex;justify-content:space-between;align-items:center">
  <div>
    <div class="nm">${esc(label)} check-in</div>
    <div class="sub">${presentShown}/${list.length} present${list.length!==roster.length?' · filtered':''}</div>
  </div>
  ${summaryBottom}
</div>`
```

---

## 5. Global search icon + tel: links

### 5a. Search icon in .bar — complete updated bar HTML

The top bar (lines 161–168) is static HTML. Add a search icon button that navigates
to the Search tab. The icon must appear in at-camp mode for all roles; hide it in
pre-camp mode via `updateModeUI()`.

**Replace line 167 (sign-out div) with:**

```html
<button class="bar-search" id="barSearch" onclick="gotoTab('search')" title="Search" aria-label="Search"
  style="display:none;width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.12);
         border:none;color:#fff;display:grid;place-items:center;cursor:pointer;flex:none">
  <!-- inline SVG to avoid ic() not being available at HTML parse time -->
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
  </svg>
</button>
<div class="sign-out" onclick="logout()">Sign out</div>
```

In `updateModeUI()` (line 340), add:

```javascript
const bs=document.getElementById('barSearch');
if(bs)bs.style.display=CAMP_MODE==='at-camp'?'grid':'none';
```

The search icon does not appear in pre-camp mode because the Search tab is not in the
pre-camp tab set and `gotoTab('search')` would show an empty screen.

### 5b. All locations needing tel: links

Every place a phone number is shown as plain text must be wrapped in a `tel:` anchor.
Because the SPA strips the `+61` country code in some legacy display paths, use a helper:

```javascript
function telLink(num, label){
  if(!num) return esc(label || '');
  const href = 'tel:' + String(num).replace(/\s/g,'');
  return `<a href="${href}" style="color:inherit;text-decoration:underline dotted">${esc(label||num)}</a>`;
}
```

**Locations that need tel: links:**

| Screen | Field | Current render | Fix |
|--------|-------|----------------|-----|
| Camper detail card (`RENDER.camper`) | `camper.mobile` | plain `esc(camper.mobile)` | `telLink(camper.mobile)` |
| Camper detail card | `camper.parentPhone` | plain text | `telLink(camper.parentPhone)` |
| Search result card (`RENDER.search`) | contact mobile from `/search/contact/:id/:role` | plain text in `.kv` | `telLink(result.mobile)` |
| My Youth registrant detail (pre-camp) | `parentPhone`, `mobile` | plain `.kv` | `telLink(...)` |
| First Day sign-in leader list | leader mobile | plain text | `telLink(...)` |

The `telLink` helper should be placed near the other utils (around line 269). On
desktop browsers `tel:` links open the default phone app (or do nothing gracefully);
on iOS/Android they trigger a call prompt.

---

## 6. Quick-note from roster — complete notePrompt function

The roster row already has a `＋ note` button calling `notePrompt(id, name)` (line 704).
The function is referenced but not defined in the current SPA. Define it:

```javascript
function notePrompt(camperId, name, event){
  if(event) event.stopPropagation();
  modal(`<h3>Add note — ${esc(name)}</h3>
    <label>Note</label>
    <textarea id="noteBody" class="fld" placeholder="Enter note…" rows="4" autofocus></textarea>
    <label>Category (optional)</label>
    <select id="noteCat" class="fld">
      <option value="note">General note</option>
      <option value="pastoral">Pastoral</option>
      <option value="medical">Medical / first aid</option>
      <option value="testimony">Testimony</option>
      <option value="behaviour">Behaviour</option>
    </select>
    <div class="err" id="noteErr" style="display:none"></div>
    <button class="btn" onclick="submitNote('${camperId}','${esc(name)}')">Save note</button>
    <button class="btn ghost" style="margin-top:8px" onclick="closeModal()">Cancel</button>`);
  setTimeout(()=>{const el=document.getElementById('noteBody');if(el)el.focus();},80);
}

async function submitNote(camperId, name){
  const body=val('noteBody');
  const category=sel('noteCat');
  const errEl=document.getElementById('noteErr');
  if(!body){if(errEl){errEl.textContent='Note cannot be empty.';errEl.style.display='block';}return;}
  try{
    await api('/notes',{method:'POST',body:{camperId,body,sessionId:SEL_SESSION||undefined,category}});
    closeModal();
    toast('Note saved for '+name);
  }catch(e){
    if(errEl){errEl.textContent=e.message;errEl.style.display='block';}
  }
}
```

The `SEL_SESSION` variable is in scope globally; passing it links the note to the
current check-in session, which the export (Part 3) will use to group notes by session.

The `category` select mirrors the values accepted by `AddNoteSchema` in
`note.service.ts` (line 17: `z.string().max(40).optional()`). No backend change needed.

The `val()` and `sel()` helpers (lines 271–272) are already defined globally.

---

## 7. Oversight pulse for director/zoneLeader on wide layout

### 7a. Per-zone progress bars using existing /status data

The at-camp home (`renderHomeAtCamp`, line ~490) already fetches `/home` which includes
`checkInsDue`. The session status endpoint (`/checkin/sessions/:id/status`) returns the
full roster. The oversight pulse reuses this data — no new endpoint needed.

**Render location:** Insert a `<div id="oversightPulse">` between the hero card and the
tiles grid in `renderHomeAtCamp`, visible only when `ACTOR.role` is `director`,
`zoneLeader`, or `admin`.

```javascript
async function renderOversightPulse(containerId){
  if(!['director','zoneLeader','admin'].includes(ACTOR.role)) return;
  if(!SEL_SESSION){
    const cur=await api('/checkin/sessions/current').catch(()=>null);
    SEL_SESSION=(cur&&cur.id)||null;
  }
  if(!SEL_SESSION){document.getElementById(containerId).innerHTML='';return;}
  const st=await api('/checkin/sessions/'+SEL_SESSION+'/status').catch(()=>null);
  if(!st||!st.roster){document.getElementById(containerId).innerHTML='';return;}

  // Aggregate by zone
  const zoneMap={};
  (st.roster||[]).forEach(r=>{
    if(!zoneMap[r.zone])zoneMap[r.zone]={in:0,total:0};
    zoneMap[r.zone].total++;
    if(r.checkedIn)zoneMap[r.zone].in++;
  });

  // If zoneLeader, scope to own zone only
  const zones=Object.entries(zoneMap).filter(([z])=>
    ACTOR.role==='zoneLeader'?z===ACTOR.zone:true
  );

  const label=_ciLabel(st.session||{});
  const barsHtml=zones.map(([z,d])=>{
    const pct=d.total>0?Math.round(d.in/d.total*100):0;
    const col=pct===100?'#16a34a':pct>=50?'#2563eb':'#b45309';
    return `<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:.76rem;font-weight:700;margin-bottom:3px">
        <span>${esc(z)} Zone</span>
        <span style="color:${col}">${d.in}/${d.total}</span>
      </div>
      <div class="bar7"><i style="width:${pct}%;background:${col}"></i></div>
    </div>`;
  }).join('');

  document.getElementById(containerId).innerHTML=`
    <div class="card" style="margin-bottom:12px">
      <div class="h3" style="margin-top:0">${esc(label)} — Check-in progress</div>
      ${barsHtml}
    </div>`;
}
```

In `renderHomeAtCamp`, add `<div id="oversightPulse"></div>` between hero and tiles,
and call:

```javascript
renderOversightPulse('oversightPulse').catch(()=>{});
```

The call is fire-and-forget (`.catch(()=>{})`) so a slow session load does not block
the home render.

### 7b. Per-church drilldown

For the `director` role, tapping a zone bar opens a church-level drilldown using the
same session status data already in memory:

```javascript
function showZoneDrilldown(zone, roster){
  const churchMap={};
  roster.filter(r=>r.zone===zone).forEach(r=>{
    if(!churchMap[r.church])churchMap[r.church]={in:0,total:0};
    churchMap[r.church].total++;
    if(r.checkedIn)churchMap[r.church].in++;
  });
  const rows=Object.entries(churchMap).map(([ch,d])=>{
    const pct=d.total>0?Math.round(d.in/d.total*100):0;
    const statusPill=pct===100
      ? `<span class="pill ok">All in ✓</span>`
      : `<span class="pill warn">${d.total-d.in} remaining</span>`;
    return `<div style="display:flex;justify-content:space-between;align-items:center;
                padding:8px 0;border-bottom:1px solid var(--line)">
        <span style="font-size:.86rem;font-weight:600">${esc(ch)}</span>
        ${statusPill}
      </div>`;
  }).join('');
  modal(`<h3>${esc(zone)} Zone — by church</h3>${rows}
    <button class="btn ghost" style="margin-top:14px" onclick="closeModal()">Close</button>`);
}
```

Each zone bar in the oversight pulse gets `onclick="showZoneDrilldown('${z}',_lastRoster)"`.
`_lastRoster` is a module-level variable set when `renderOversightPulse` fetches the
status:

```javascript
let _lastRoster = [];
// inside renderOversightPulse, after the fetch:
_lastRoster = st.roster || [];
```

This avoids a second fetch for the drilldown.

---

## 8. Urgent notice interstitial — complete checkUrgentNotices function

When a user navigates to the home screen (or back to it), the app should check whether
any unacknowledged urgent notices exist and display them as a full-screen overlay rather
than passively showing them in the notices list.

```javascript
const _URGENT_ACK_KEY = 'cp_urgent_acked';
function _ackedSet(){
  try{return new Set(JSON.parse(localStorage.getItem(_URGENT_ACK_KEY)||'[]'));}catch{return new Set();}
}

async function checkUrgentNotices(){
  try{
    const feed = await api('/notifications');
    const acked = _ackedSet();
    const urgent = (feed||[]).filter(n=>n.priority==='urgent'&&!acked.has(n.id));
    if(urgent.length===0)return;
    // Show the most recent unacknowledged urgent notice as an interstitial
    const n=urgent[0];
    modal(`<div style="text-align:center;padding:8px 0 4px">
      <span style="font-size:2rem">&#9888;&#65039;</span>
      <h3 style="color:var(--danger);margin:8px 0 4px">${esc(n.title)}</h3>
      <div style="font-size:.86rem;color:#7f1d1d;background:#fef2f2;border-radius:10px;
                  padding:10px 13px;margin:8px 0 14px;text-align:left">${esc(n.body)}</div>
      <div style="font-size:.74rem;color:var(--muted);margin-bottom:14px">
        ${urgent.length>1?`${urgent.length-1} more urgent notice${urgent.length>2?'s':''} in Notices tab`:''}
      </div>
      <button class="btn red" onclick="_ackUrgent('${esc(n.id)}')">Acknowledged</button>
    </div>`);
  }catch(e){/* silent — notice check must not block home render */}
}

function _ackUrgent(id){
  const s=_ackedSet();s.add(id);
  try{localStorage.setItem(_URGENT_ACK_KEY,JSON.stringify([...s]));}catch{}
  closeModal();
  // If more urgent notices remain, show next after a brief pause
  setTimeout(checkUrgentNotices, 300);
}
```

Call `checkUrgentNotices()` at the end of `renderHomeAtCamp` (after `paint()`) for
all roles. The ack list is per-device (`localStorage`); a device that missed the
interstitial will see it on next home navigation.

The existing `_DISMISS_KEY` mechanism (line 535) is for the home-page notice cards
and is separate from this urgent ack list.

---

## 9. "My day" home for church role — updated renderHomeAtCamp section

For `ACTOR.role === 'church'`, the home screen should show a "My day" summary card
instead of (or above) the generic tiles. This uses data already available from
`/home` and the check-in status.

**My day card** — insert above the tiles grid when `ACTOR.role === 'church'`:

```javascript
async function renderMyDay(containerId){
  if(ACTOR.role!=='church') return;
  // Fetch current session check-in status (scoped to this church by the RBAC layer)
  let myDayHtml='';
  try{
    if(!SEL_SESSION){
      const cur=await api('/checkin/sessions/current').catch(()=>null);
      SEL_SESSION=(cur&&cur.id)||null;
    }
    const [st,sched]=await Promise.all([
      SEL_SESSION?api('/checkin/sessions/'+SEL_SESSION+'/status').catch(()=>null):Promise.resolve(null),
      api('/schedule').catch(()=>[]),
    ]);

    // Check-in progress for my church
    let ciBlock='<div class="sub">No active check-in session</div>';
    if(st&&st.roster){
      const r=st.roster;
      const total=r.length, inCount=r.filter(x=>x.checkedIn).length;
      const pct=total>0?Math.round(inCount/total*100):0;
      const label=_ciLabel(st.session||{});
      ciBlock=`<div style="font-weight:700;font-size:.9rem;margin-bottom:4px">${esc(label)} — ${inCount}/${total} checked in</div>
        <div class="bar7"><i style="width:${pct}%;background:${pct===100?'#16a34a':'#2563eb'}"></i></div>
        ${pct<100?`<button class="btn sm" style="margin-top:8px" onclick="gotoTab('checkin')">Go to check-in</button>`:'<span class="pill ok" style="margin-top:6px;display:inline-block">All in ✓</span>'}`;
    }

    // Next schedule item
    const now=new Date();
    const todayItems=(sched||[]).filter(i=>{
      try{return new Date(i.day+'T23:59:00Z')>=now;}catch{return false;}
    }).sort((a,b)=>a.day.localeCompare(b.day)||a.startTime.localeCompare(b.startTime));
    const next=todayItems[0];
    const nextBlock=next
      ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:10px;border-top:1px solid var(--line)">
           <div><div style="font-size:.68rem;font-weight:800;text-transform:uppercase;color:var(--muted);letter-spacing:.05em">Next up</div>
             <div style="font-weight:700;font-size:.88rem">${esc(next.title)}</div>
             <div style="font-size:.72rem;color:var(--muted)">${esc(next.startTime)}${next.location?' · '+esc(next.location):''}</div></div>
           ${ic('calendar')}
         </div>`
      : '';

    myDayHtml=`<div class="card" style="margin-bottom:12px">${ciBlock}${nextBlock}</div>`;
  }catch(e){myDayHtml='';}
  document.getElementById(containerId).innerHTML=myDayHtml;
}
```

In `renderHomeAtCamp`, add `<div id="myDay"></div>` between the hero and tiles:

```javascript
const html=`<div class="hero">…</div>
  <div id="myDay"></div>
  <div class="tiles">${tiles.join('')}</div>
  …`;
paint('home', html, 'Home', d.greetingName||ACTOR.displayName);
document.getElementById('home').innerHTML = html;
renderMyDay('myDay').catch(()=>{});
if(CAMP_MODE==='at-camp') checkUrgentNotices();
```

Note: `renderMyDay` is fire-and-forget; the home screen paints immediately with a
placeholder `<div id="myDay"></div>` and the My day card fills in asynchronously.
This avoids blocking the home render on a second API round-trip.

**Director/zoneLeader** roles get the oversight pulse (section 7) in the same `myDay`
container; `renderOversightPulse` and `renderMyDay` are mutually exclusive by role.
A cleaner pattern is a single `renderHomeExtras(containerId)` dispatcher:

```javascript
function renderHomeExtras(containerId){
  if(ACTOR.role==='church') return renderMyDay(containerId);
  if(['director','zoneLeader','admin'].includes(ACTOR.role)) return renderOversightPulse(containerId);
  return Promise.resolve();
}
```

Call `renderHomeExtras('myDay').catch(()=>{})` once after `paint('home',...)`.

---

## 10. Validation tests

Place these tests in `docs/verification/test_p1_checkin_ux.py`. They extend the
existing verification harness patterns established in `docs/verification/`.

```python
"""
Part 1 — On-ground UX: integration smoke tests.
Requires a running dev server with PERSISTENCE=memory (demo seed data loaded).
Run: python docs/verification/test_p1_checkin_ux.py
"""
import requests, sys, json

BASE = "http://localhost:4200"
PASS = "demo1234"

def login(username):
    r = requests.post(f"{BASE}/auth/login", json={"username": username, "password": PASS})
    r.raise_for_status()
    return r.json()["token"]

def api(token, method, path, body=None):
    headers = {"Authorization": f"Bearer {token}"}
    if method == "GET":
        r = requests.get(f"{BASE}{path}", headers=headers)
    else:
        r = requests.request(method, f"{BASE}{path}", json=body, headers=headers)
    r.raise_for_status()
    return r.json() if r.status_code != 204 else None


# -----------------------------------------------------------------------
def test_roster_has_gender_grade_medical_flag():
    """
    GET /checkin/sessions/:id/status must return roster entries that include
    gender, grade, and medicalFlag fields (the DTO enrichment from section 2a).
    """
    token = login("director")

    sessions = api(token, "GET", "/checkin/sessions")
    assert sessions, "No check-in sessions returned — seed data may not include schedule items"

    session_id = sessions[0]["id"]
    status = api(token, "GET", f"/checkin/sessions/{session_id}/status")

    assert "roster" in status, "SessionStatus missing 'roster' key"
    roster = status["roster"]
    assert len(roster) > 0, "Roster is empty — no campers at camp in seed data"

    entry = roster[0]

    # gender
    assert "gender" in entry, f"RosterEntry missing 'gender'. Keys: {list(entry.keys())}"
    assert entry["gender"] in ("male", "female", "unspecified"), \
        f"Unexpected gender value: {entry['gender']}"

    # grade (nullable)
    assert "grade" in entry, f"RosterEntry missing 'grade'. Keys: {list(entry.keys())}"
    assert entry["grade"] is None or isinstance(entry["grade"], int), \
        f"grade must be int or null, got {type(entry['grade'])}"

    # medicalFlag
    assert "medicalFlag" in entry, f"RosterEntry missing 'medicalFlag'. Keys: {list(entry.keys())}"
    assert isinstance(entry["medicalFlag"], bool), \
        f"medicalFlag must be bool, got {type(entry['medicalFlag'])}"

    print(f"  PASS  roster[0]: gender={entry['gender']}, grade={entry['grade']}, "
          f"medicalFlag={entry['medicalFlag']}")


# -----------------------------------------------------------------------
def test_checkin_persists_and_shows_on_reload():
    """
    POST /checkin then GET /checkin/sessions/:id/status must show the camper
    as checkedIn=true. A second call with type='out' must flip it back.
    """
    token = login("director")

    sessions = api(token, "GET", "/checkin/sessions")
    assert sessions, "No sessions"
    session_id = sessions[0]["id"]

    status_before = api(token, "GET", f"/checkin/sessions/{session_id}/status")
    roster = status_before["roster"]
    assert roster, "Empty roster"

    # Pick a camper who is currently NOT checked in (prefer unchecked for clean test)
    target = next((r for r in roster if not r["checkedIn"]), roster[0])
    camper_id = target["camperId"]
    was_checked_in = target["checkedIn"]

    # Check in
    api(token, "POST", "/checkin", {"camperId": camper_id, "sessionId": session_id, "type": "in"})

    # Reload status
    status_after_in = api(token, "GET", f"/checkin/sessions/{session_id}/status")
    entry_after_in = next(r for r in status_after_in["roster"] if r["camperId"] == camper_id)
    assert entry_after_in["checkedIn"] is True, \
        f"Expected checkedIn=True after check-in, got {entry_after_in['checkedIn']}"
    assert entry_after_in["lastEntry"] == "in", \
        f"Expected lastEntry='in', got {entry_after_in['lastEntry']}"

    print(f"  PASS  check-in: {camper_id} is now checkedIn=True")

    # Check out
    api(token, "POST", "/checkin", {"camperId": camper_id, "sessionId": session_id, "type": "out"})

    status_after_out = api(token, "GET", f"/checkin/sessions/{session_id}/status")
    entry_after_out = next(r for r in status_after_out["roster"] if r["camperId"] == camper_id)
    assert entry_after_out["checkedIn"] is False, \
        f"Expected checkedIn=False after check-out, got {entry_after_out['checkedIn']}"
    assert entry_after_out["lastEntry"] == "out", \
        f"Expected lastEntry='out', got {entry_after_out['lastEntry']}"

    print(f"  PASS  check-out: {camper_id} is now checkedIn=False")

    # Restore original state if camper was checked in before the test
    if was_checked_in:
        api(token, "POST", "/checkin", {"camperId": camper_id, "sessionId": session_id, "type": "in"})


# -----------------------------------------------------------------------
if __name__ == "__main__":
    failures = []
    for name, fn in [
        ("test_roster_has_gender_grade_medical_flag", test_roster_has_gender_grade_medical_flag),
        ("test_checkin_persists_and_shows_on_reload",  test_checkin_persists_and_shows_on_reload),
    ]:
        print(f"\n{name}")
        try:
            fn()
        except Exception as e:
            print(f"  FAIL  {e}")
            failures.append(name)

    print()
    if failures:
        print(f"FAILED: {', '.join(failures)}")
        sys.exit(1)
    else:
        print("All Part 1 tests passed.")
```

### Test coverage rationale

**`test_roster_has_gender_grade_medical_flag`** — directly validates section 2a: the
server-side DTO enrichment. If `toRosterEntry` is not updated, the fields will be
missing and the test fails. A passing test confirms the SPA can drop its `/campers`
piggyback fetch.

**`test_checkin_persists_and_shows_on_reload`** — validates the core contract that the
optimistic UI relies on: the server MUST persist the check-in and return the updated
state on the next status fetch. If this fails, the optimistic flip is misleading (the
UI shows checked but the server never stored it). The test also exercises `lastEntry`
which the SPA uses to set button state.

Both tests use the `director` account which has `checkin:write` and camp-wide roster
access, making them independent of church-scoped RBAC.

---

## Implementation order

The changes above are independent enough to land in two commits:

1. **Backend DTO only** — `src/api/dto/person.dto.ts` (section 2a). One file, no
   behaviour change, immediately testable with `test_roster_has_gender_grade_medical_flag`.
2. **SPA all-up** — `public/index.html` (sections 2c, 3, 4, 5, 6, 7, 8, 9). One file.
   The SPA change is safe to deploy after the backend DTO lands (the new fields are
   additive; old SPA reading old DTO just gets `undefined` for the new fields, which
   the existing guard `c.gender||''` already handles gracefully).

No database migrations, no new API endpoints, no new npm packages.
