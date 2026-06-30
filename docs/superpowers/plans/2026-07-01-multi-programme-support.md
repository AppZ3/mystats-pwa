# Multi-Programme Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded 2-programme (A/B) system with a data-driven system supporting up to 10 user-defined programmes, each with the same rich block-structured Today session as A/B currently has, manageable (create/rename/delete) and editable (manual block builder) or uploadable (JSON/PDF/Word) from Settings.

**Architecture:** A new `js/programmes.js` becomes the single data-access layer for the programme list and each programme's block-structured weekly sessions, stored in IndexedDB `settings` (keyed `programmes_list`, `programme_<id>_sessions`). On first load it seeds itself with Programme A and B, copying today's hardcoded `PROG_A_SESSIONS`/`PROG_B_SESSIONS` constants in as regular (now-editable) data. `config.js`'s old hardcoded `getProgrammeSession` ternary, plus the now-superseded flat `schedule`/`targets`/`meta` settings keys, are removed — every consumer goes through `programmes.js` instead, uniformly, for every programme id. A new `js/programme-editor.js` (Settings-side UI) owns the programme manager (list/add/rename/delete) and a manual block builder, plus the upload/parse logic moved out of `js/settings.js` and generalized to target any programme id instead of only A/B.

**Tech Stack:** Same vanilla ES modules / IndexedDB / no-build-step approach as the rest of the app. No new dependencies.

## Global Constraints

- No automated test framework exists in this repo. Every task's verification step is manual: run `vercel dev` (or `python3 -m http.server 8080`), drive the app in a browser, and describe what you see — not a unit test. Before that, syntax-check every modified/created `.js` file with `node --input-type=module < path/to/file.js` (an `ERR_MODULE_NOT_FOUND` for a bare import like `./db.js` is expected and OK — only real `SyntaxError` output is a failure).
- Max 10 programmes total. IDs are single uppercase letters `A`–`J`, allocated as "lowest unused letter" (so deleting `C` and adding a new programme reuses `C`).
- Every new/modified `.js` file must be added to `ASSETS` in `sw.js`, and `CACHE` must be bumped — otherwise the service worker keeps serving stale cached files on a real device. Do this as the last task, once, for all files touched in this plan.
- Follow existing conventions exactly:
  - `esc()` from `js/db.js` wraps every piece of interpolated user text in HTML templates.
  - Inside render/event functions, use `container.querySelector(...)`, never `document.getElementById`.
  - `.hidden { display:none !important }` is the show/hide mechanism — toggle the class, don't touch `style.display` directly.
  - Render functions build a full `container.innerHTML` string and re-render wholesale after every mutation; there is no partial DOM patching elsewhere in this codebase, so don't introduce one here. Editable lists keep a small `let workingArray = [...initial]` per editor, mutate it on add/remove, call a local `refresh()` that rebuilds just that list's inner HTML from the array, and read final field values straight off the DOM at Save time (see `setupChecklistEvents` in `js/settings.js:529` for the canonical example — typing into one row, then adding another row, will reset any *unsaved* edits in other rows back to their last-synced value; this is accepted existing behavior, not a bug to fix here).
- Existing `workouts` records store `programme` as a plain string (`'A'` or `'B'`). New programme ids must stay plain uppercase-letter strings so this old data keeps matching in `today.js`'s `getPrevExercise`.
- `getProgrammeSchedule`, `getProgrammeTargets`, and `getProgrammeMeta` in `js/config.js` are being removed outright (not deprecated-but-kept) — their only real consumers are the Settings UI being replaced in this plan, and one *unused* import in `js/today.js` (confirmed via `grep`, safe to drop).

---

## Codebase Context (read before starting any task)

**The exact block schema** (from `js/profile.js:189-470`, `PROG_A_SESSIONS`/`PROG_B_SESSIONS` — this is what Today already renders and what the new system must produce identically):

```js
// A day's session:
{ label: 'Pull Skill + Vertical Strength', focus: 'Front Lever · Muscle-Up · Back · Biceps', blocks: [ /* ...block objects... */ ] }
// Rest day:
{ label: 'Rest / Active Recovery', focus: 'Recovery', blocks: [] }

// Block shapes by type:
{ type: 'warmup', items: ['Dead hang — 2 × 30 sec', 'Scapular pull-ups — 15 reps'] }
{ type: 'core',   items: ['L-sit hold (parallettes) — 3 × 15 sec'] }
{ type: 'skill', name: 'Front Lever', note: 'optional', exercises: [
  { name: 'Tuck front lever hold', sets: 5, target: '8s', note: 'optional' },
]}
{ type: 'strength', label: 'optional', exercises: [
  { name: 'Weighted pull-up', sets: 4, reps: '6', note: 'Strict form' },
]}
{ type: 'circuit', label: '3 rounds — rest 90 sec between rounds', exercises: [
  { name: 'Pull-up', reps: '8' },
]}
{ type: 'cardio', label: 'Zone 2 Run', target: '35-40 min', bpmTarget: '130-145', note: 'optional' }
{ type: 'mobility', label: 'Mobility Session 1 — Upper body, shoulders, thoracic, wrists (~45 min)' }
```

**Settings storage pattern:** `dbGet('settings', key)` returns `{key, value}` or `undefined`; always read `.value` and fall back with `??`/`?? `. `dbPut('settings', {key, value})` upserts (the `settings` store's `keyPath` is `'key'`).

**`js/db.js` exports used throughout this plan:** `dbGet`, `dbPut`, `dbDelete`, `dbGetAll`, `esc`, `todayStr`, `localDateStr` (the last two added in the prior session's date-bug fix — not otherwise relevant here).

**Settings accordion pattern** (`js/settings.js:76-88`, `section(id, title, content)`): wraps a section in a collapsible card. Reuse as-is for the new "Programmes" section.

**Editable-list pattern** (`js/settings.js:529-572`, `setupChecklistEvents`): the canonical add/remove/save idiom referenced in Global Constraints above. The block builder in this plan follows the same idiom one level deeper (blocks, and exercises-within-a-block).

**Day-pill pattern** (`js/today.js:531-536`, the `Sun`...`Sat` row): reuse the same `.ctrl-pill`/`.day-pill` CSS classes for the block builder's day tabs.

**Toast helper:** `showToast(msg)` is defined at `js/settings.js:1215` — it's local to that file (not exported). `js/programme-editor.js` will need its own tiny copy (same body) since it has no `js/settings.js` import to draw from — keep it identical in behavior, this is the only acceptable duplication in this plan (everything else routes through `js/programmes.js`).

---

## File Structure

| File | Action | Responsibility |
|------|--------|-----------------|
| `js/programmes.js` | **Create** | Programme list + per-programme session data: list/get/create/rename/delete, seed-from-hardcoded-defaults, get/save sessions |
| `js/programme-editor.js` | **Create** | Settings-side UI: programme manager (list/add/rename/delete) + manual block builder + upload (JSON/PDF/Word) |
| `js/config.js` | Modify | Remove `getProgrammeSchedule`, `getProgrammeTargets`, `getProgrammeMeta`, `getProgrammeSession` (superseded by `programmes.js`) |
| `js/today.js` | Modify | Programme pill row renders from the full programme list; `getProgrammeSession` call becomes `await`ed and imported from `programmes.js` |
| `js/app.js` | Modify | Call `ensureSeeded()` once during init, before the first tab renders |
| `js/settings.js` | Modify | Remove the old `renderProgramme`/`progExRow`/`setupProgEvents`/`addProgExercise`/`renderProgrammeUpload`/upload-parsing functions; replace the `progUpload`/`progA`/`progB` sections with one `programmes` section delegating to `programme-editor.js` |
| `style.css` | Modify | Styles for the programme manager list, block builder (block cards, exercise sub-rows, add-block row), and pill-row wrapping |
| `sw.js` | Modify | Add `js/programmes.js` + `js/programme-editor.js` to `ASSETS`, bump `CACHE` |

---

## Task 1: `js/programmes.js` — programme data layer

**Files:**
- Create: `js/programmes.js`

**Interfaces:**
- Produces: `ensureSeeded(): Promise<Array<{id,name,source,description,updatedAt}>>`, `listProgrammes(): Promise<same>`, `getProgrammeMeta(id): Promise<entry|null>`, `createProgramme(name): Promise<entry>`, `renameProgramme(id, name): Promise<void>`, `deleteProgramme(id): Promise<void>`, `getSessions(id): Promise<{0..6: dayObject}>`, `saveSessions(id, sessions): Promise<void>`, `getProgrammeSession(id, day): Promise<dayObject>`, `MAX_PROGRAMMES` (const, 10), `BLOCK_TYPES` (const array, see below)

- [ ] **Step 1: Write `js/programmes.js`**

```js
import { dbGet, dbPut, dbDelete } from './db.js';
import { PROG_A_SESSIONS, PROG_B_SESSIONS } from './profile.js';

export const MAX_PROGRAMMES = 10;
const ALL_IDS = 'ABCDEFGHIJ'.split('');
const REST_DAY = Object.freeze({ label: 'Rest', focus: 'Recovery', blocks: [] });

export const BLOCK_TYPES = [
  { type: 'warmup',   label: 'Warm-Up',  kind: 'items' },
  { type: 'core',     label: 'Core',     kind: 'items' },
  { type: 'skill',    label: 'Skill',    kind: 'skill' },
  { type: 'strength', label: 'Strength', kind: 'strength' },
  { type: 'circuit',  label: 'Circuit',  kind: 'circuit' },
  { type: 'cardio',   label: 'Cardio',   kind: 'cardio' },
  { type: 'mobility', label: 'Mobility', kind: 'mobility' },
];

function emptyWeek() {
  const week = {};
  for (let d = 0; d <= 6; d++) week[d] = { label: 'Rest', focus: 'Recovery', blocks: [] };
  return week;
}

export async function ensureSeeded() {
  const list = await dbGet('settings', 'programmes_list');
  if (list) return list.value;
  const seeded = [
    { id: 'A', name: 'Programme A — Calisthenics',  source: 'builtin', description: '', updatedAt: new Date().toISOString() },
    { id: 'B', name: 'Programme B — Power & Strength', source: 'builtin', description: '', updatedAt: new Date().toISOString() },
  ];
  await dbPut('settings', { key: 'programmes_list', value: seeded });
  await dbPut('settings', { key: 'programme_a_sessions', value: PROG_A_SESSIONS });
  await dbPut('settings', { key: 'programme_b_sessions', value: PROG_B_SESSIONS });
  return seeded;
}

export async function listProgrammes() {
  return ensureSeeded();
}

export async function getProgrammeMeta(id) {
  const list = await listProgrammes();
  return list.find(p => p.id === id) || null;
}

function nextFreeId(list) {
  const used = new Set(list.map(p => p.id));
  return ALL_IDS.find(id => !used.has(id)) ?? null;
}

export async function createProgramme(name) {
  const list = await listProgrammes();
  if (list.length >= MAX_PROGRAMMES) throw new Error(`Maximum ${MAX_PROGRAMMES} programmes reached`);
  const id = nextFreeId(list);
  if (!id) throw new Error('No free programme slot');
  const entry = { id, name: name || `Programme ${id}`, source: 'manual', description: '', updatedAt: new Date().toISOString() };
  await dbPut('settings', { key: 'programmes_list', value: [...list, entry] });
  await dbPut('settings', { key: `programme_${id.toLowerCase()}_sessions`, value: emptyWeek() });
  return entry;
}

export async function renameProgramme(id, name) {
  const list = await listProgrammes();
  const updated = list.map(p => p.id === id ? { ...p, name, updatedAt: new Date().toISOString() } : p);
  await dbPut('settings', { key: 'programmes_list', value: updated });
}

export async function deleteProgramme(id) {
  const list = await listProgrammes();
  if (list.length <= 1) throw new Error('At least one programme must remain');
  await dbPut('settings', { key: 'programmes_list', value: list.filter(p => p.id !== id) });
  await dbDelete('settings', `programme_${id.toLowerCase()}_sessions`);
}

export async function getSessions(id) {
  const s = await dbGet('settings', `programme_${id.toLowerCase()}_sessions`);
  return s?.value ?? emptyWeek();
}

export async function saveSessions(id, sessions) {
  await dbPut('settings', { key: `programme_${id.toLowerCase()}_sessions`, value: sessions });
  const list = await listProgrammes();
  const updated = list.map(p => p.id === id ? { ...p, updatedAt: new Date().toISOString() } : p);
  await dbPut('settings', { key: 'programmes_list', value: updated });
}

export async function getProgrammeSession(id, day) {
  const sessions = await getSessions(id);
  return sessions[day] ?? { ...REST_DAY };
}
```

- [ ] **Step 2: Syntax-check**

Run: `node --input-type=module < js/programmes.js`
Expected: Either no output, or only `Error [ERR_MODULE_NOT_FOUND]: Cannot find module './db.js'` (bare-import resolution failure — OK). Any `SyntaxError` is a real failure — fix it.

- [ ] **Step 3: Manual smoke-test via browser console**

Run `vercel dev --listen 3211` (or `python3 -m http.server 8080`), open the app in a browser, open devtools console, and run:

```js
const m = await import('/js/programmes.js');
console.log(await m.listProgrammes());
```

Expected: an array of two entries, ids `'A'` and `'B'`, both `source: 'builtin'`. Then run:

```js
console.log(await m.getProgrammeSession('A', 3));
```

Expected: the full Day-3 ("Pull Skill + Vertical Strength") session object with 4 blocks (warmup/skill/skill/strength/core — 5 actually, recheck against `PROG_A_SESSIONS[3]` in `js/profile.js`), matching `PROG_A_SESSIONS[3]` from `js/profile.js` exactly.

- [ ] **Step 4: Commit**

```bash
git add js/programmes.js
git commit -m "feat: programme data layer — list/CRUD/sessions, seeded from hardcoded A/B"
```

---

## Task 2: CSS — programme manager, block builder, pill-row wrap

**Files:**
- Modify: `style.css`

- [ ] **Step 1: Find the existing `.ctrl-group` rule and add wrapping**

In `style.css`, find:
```css
.ctrl-group { display: flex; gap: .2rem; }
```
Replace with:
```css
.ctrl-group { display: flex; gap: .2rem; flex-wrap: wrap; }
```

- [ ] **Step 2: Append new rules to the end of `style.css`**

```css
/* ── Programme Manager ──────────────────────────────────────────────── */
.prog-mgr-list { display: flex; flex-direction: column; gap: .5rem; margin-bottom: .75rem; }
.prog-mgr-row { display: flex; align-items: center; gap: .5rem; padding: .6rem; background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; }
.prog-mgr-id { width: 1.8rem; height: 1.8rem; flex: 0 0 auto; border-radius: 50%; background: var(--accent); color: #fff; font-weight: 700; font-size: .85rem; display: flex; align-items: center; justify-content: center; }
.prog-mgr-info { flex: 1; min-width: 0; }
.prog-mgr-name { font-weight: 600; font-size: .9rem; }
.prog-mgr-badge { font-size: .72rem; color: var(--muted); text-transform: uppercase; letter-spacing: .03em; }
.prog-mgr-actions { display: flex; gap: .3rem; flex: 0 0 auto; }

/* ── Block Builder ──────────────────────────────────────────────────── */
.block-day-tabs { display: flex; flex-wrap: wrap; gap: .3rem; margin: .6rem 0; }
.block-list { display: flex; flex-direction: column; gap: .5rem; margin-bottom: .6rem; }
.block-card { background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; padding: .6rem; }
.block-card-header { display: flex; align-items: center; gap: .4rem; margin-bottom: .4rem; }
.block-type-badge { font-size: .72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; color: var(--accent); flex: 0 0 auto; }
.block-card-actions { margin-left: auto; display: flex; gap: .2rem; }
.block-card-fields { display: flex; flex-wrap: wrap; gap: .35rem; margin-bottom: .4rem; }
.block-card-fields .input-field { flex: 1; min-width: 8rem; }
.blk-ex-row { display: flex; gap: .3rem; align-items: center; margin-bottom: .3rem; }
.blk-ex-row .input-field { flex: 1; min-width: 0; }
.blk-ex-num { flex: 0 0 3.5rem !important; }
.block-add-row { display: flex; gap: .4rem; }
.block-add-row select { flex: 0 0 auto; width: 9rem; }
.block-add-row button { flex: 1; }
```

- [ ] **Step 2: Verify**

Run: `node -e "require('fs').readFileSync('style.css','utf8')"` — just confirms the file is readable/UTF-8 valid (CSS has no syntax-check tooling in this project; visual verification happens once the matching HTML exists in later tasks).

- [ ] **Step 3: Commit**

```bash
git add style.css
git commit -m "style: programme manager + block builder + pill-row wrap"
```

---

## Task 3: `js/config.js` — remove superseded programme exports

**Files:**
- Modify: `js/config.js`

- [ ] **Step 1: Remove the four programme-related exports and their now-unused imports**

Current `js/config.js` imports `PROGRAMME_A, PROGRAMME_B, PROG_A_SESSIONS, PROG_B_SESSIONS` from `./profile.js` and exports `getProgrammeSchedule`, `getProgrammeTargets`, `getProgrammeMeta`, `getProgrammeSession`. Replace the whole file with:

```js
// Shared helpers: load user settings with profile.js defaults as fallback
import { dbGet } from './db.js';
import { MORNING_ROUTINE, SUPPLEMENTS, TARGETS, PROFILE, DEFAULT_CHECKLIST_ITEMS } from './profile.js';

export async function getChecklistItems() {
  const s = await dbGet('settings', 'checklist_items');
  return s?.value ?? DEFAULT_CHECKLIST_ITEMS;
}

export async function getMorningRoutine() {
  const s = await dbGet('settings', 'morning_routine');
  return s?.value ?? MORNING_ROUTINE;
}

export async function getSupplements() {
  const s = await dbGet('settings', 'supplements');
  return s?.value ?? SUPPLEMENTS;
}

export async function getTargets() {
  const s = await dbGet('settings', 'targets');
  return s?.value ?? TARGETS;
}

export async function getUserProfile() {
  const s = await dbGet('settings', 'user_profile');
  return s?.value ?? PROFILE;
}
```

(`getTargets`/`getUserProfile`/`getChecklistItems`/`getMorningRoutine`/`getSupplements` are body-composition/profile helpers, unrelated to programmes — keep them exactly as they were.)

- [ ] **Step 2: Syntax-check**

Run: `node --input-type=module < js/config.js`
Expected: only `ERR_MODULE_NOT_FOUND` for `./db.js`/`./profile.js`, no `SyntaxError`.

- [ ] **Step 3: Commit**

This task's commit is folded into Task 4 (today.js depends on it and they must land together to keep the app working at every commit) — no separate commit here.

---

## Task 4: `js/today.js` — programme pill row from the full list, await session load

**Files:**
- Modify: `js/today.js`

**Interfaces:**
- Consumes: `listProgrammes()`, `getProgrammeSession(id, day): Promise<dayObject>` from `js/programmes.js` (Task 1)

- [ ] **Step 1: Update the import line**

Find (near the top of `js/today.js`):
```js
import { dbGet, dbPut, dbGetAll, dbGetByIndex, dbAdd, esc, todayStr } from './db.js';
import { renderJournalPrompt } from './journal.js';
import { getChecklistItems, getSupplements, getProgrammeSchedule, getProgrammeTargets, getProgrammeSession } from './config.js';
```
Replace with:
```js
import { dbGet, dbPut, dbGetAll, dbGetByIndex, dbAdd, esc, todayStr } from './db.js';
import { renderJournalPrompt } from './journal.js';
import { getChecklistItems, getSupplements } from './config.js';
import { listProgrammes, getProgrammeSession } from './programmes.js';
```

- [ ] **Step 2: Make the session lookup `await`ed and load the programme list**

Find (`renderToday`, currently around line 497-507):
```js
  const [savedProg, savedWeek, checklistItems, allSupplements, allWorkouts] = await Promise.all([
    getCurrentProgramme(), getCurrentWeek(), getChecklistItems(), getSupplements(), dbGetAll('workouts'),
  ]);
  cachedAllWorkouts = allWorkouts;
  const prog = pendingProg ?? savedProg;
  const week = pendingWeek ?? savedWeek;
  activeProg = prog;
  activeWeek = week;
  if (pendingDay !== null) selectedDay = pendingDay;

  const session  = getProgrammeSession(prog, selectedDay);
```
Replace with:
```js
  const [savedProg, savedWeek, checklistItems, allSupplements, allWorkouts, programmes] = await Promise.all([
    getCurrentProgramme(), getCurrentWeek(), getChecklistItems(), getSupplements(), dbGetAll('workouts'), listProgrammes(),
  ]);
  cachedAllWorkouts = allWorkouts;
  const validIds = new Set(programmes.map(p => p.id));
  const prog = validIds.has(pendingProg) ? pendingProg : (validIds.has(savedProg) ? savedProg : programmes[0].id);
  const week = pendingWeek ?? savedWeek;
  activeProg = prog;
  activeWeek = week;
  if (pendingDay !== null) selectedDay = pendingDay;

  const session  = await getProgrammeSession(prog, selectedDay);
```

(The `validIds` fallback handles the case where a saved/pending programme id was since deleted — falls back to the first programme in the list instead of rendering a blank Rest day forever.)

- [ ] **Step 3: Render the pill row from the full list**

Find:
```js
      <div class="ctrl-group">
        <button class="ctrl-pill prog-pill ${prog === 'A' ? 'active' : ''}" data-prog="A">A</button>
        <button class="ctrl-pill prog-pill ${prog === 'B' ? 'active' : ''}" data-prog="B">B</button>
      </div>
```
Replace with:
```js
      <div class="ctrl-group">
        ${programmes.map(p => `
          <button class="ctrl-pill prog-pill ${prog === p.id ? 'active' : ''}" data-prog="${p.id}" title="${esc(p.name)}">${esc(p.id)}</button>
        `).join('')}
      </div>
```

- [ ] **Step 4: Syntax-check**

Run: `node --input-type=module < js/today.js`
Expected: only `ERR_MODULE_NOT_FOUND`, no `SyntaxError`.

- [ ] **Step 5: Manual verification**

Start `vercel dev --listen 3211`, open the app, go to the Today tab. Expected: two pills, "A" and "B", same as before this change (since only two programmes exist yet — Task 6 adds the manager UI to create more). Click between them, confirm the session still renders and Apply still works exactly as before.

- [ ] **Step 6: Commit**

```bash
git add js/config.js js/today.js
git commit -m "feat: today.js reads programmes from the new data layer (drops hardcoded A/B)"
```

---

## Task 5: `js/app.js` — seed programmes on init

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Import and call `ensureSeeded()` before the first render**

Find the `init()` function's start (near the top of `js/app.js`, before `dbGetAll('reminders')` / `await initDB()` — read the file to find the exact line, it's the first few lines of `async function init()`). Add the import:
```js
import { ensureSeeded } from './programmes.js';
```
Then, as the first line inside `async function init()` (right after `initDB()` resolves, before any tab is rendered):
```js
  await ensureSeeded();
```

- [ ] **Step 2: Syntax-check**

Run: `node --input-type=module < js/app.js`
Expected: only `ERR_MODULE_NOT_FOUND`, no `SyntaxError`.

- [ ] **Step 3: Manual verification**

Clear IndexedDB for the dev origin (devtools → Application → IndexedDB → delete `mystats`), reload the app, go through onboarding, land on Today. Expected: A/B pills appear immediately (proves seeding ran before the first Today render, not just on first Settings visit).

- [ ] **Step 4: Commit**

```bash
git add js/app.js
git commit -m "feat: seed default programmes on app init"
```

---

## Task 6: `js/programme-editor.js` — programme manager UI (list/add/rename/delete)

**Files:**
- Create: `js/programme-editor.js`

**Interfaces:**
- Consumes: `listProgrammes`, `createProgramme`, `renameProgramme`, `deleteProgramme`, `MAX_PROGRAMMES` from `js/programmes.js`
- Produces: `export async function renderProgrammeManager(container)` — the entry point `js/settings.js` will call (wired in Task 10). Internally exported for later tasks in this file: nothing yet (block builder is added to this same file in Tasks 7-9).

- [ ] **Step 1: Write the manager list + add/rename/delete UI**

```js
import { esc } from './db.js';
import { listProgrammes, createProgramme, renameProgramme, deleteProgramme, MAX_PROGRAMMES } from './programmes.js';

function showToast(msg) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove('show'), 2200);
}

let expandedId = null; // which programme's block builder is open, if any

export async function renderProgrammeManager(container) {
  const list = await listProgrammes();
  const mount = container.querySelector('#programme-manager-mount');
  if (!mount) return;
  mount.innerHTML = `
    <p class="muted" style="font-size:.8rem;margin-bottom:.6rem">Manage your training programmes (up to ${MAX_PROGRAMMES}). The active one is picked on the Today tab.</p>
    <div class="prog-mgr-list">
      ${list.map(progMgrRow).join('')}
    </div>
    <button class="btn-primary" id="add-programme-btn" ${list.length >= MAX_PROGRAMMES ? 'disabled' : ''}>+ Add Programme</button>
    <div id="block-editor-mount"></div>
  `;
  setupManagerEvents(container);
  if (expandedId && list.some(p => p.id === expandedId)) {
    await renderBlockEditor(container, expandedId);
  }
}

function progMgrRow(p) {
  return `
    <div class="prog-mgr-row" data-id="${p.id}">
      <div class="prog-mgr-id">${esc(p.id)}</div>
      <div class="prog-mgr-info">
        <div class="prog-mgr-name">${esc(p.name)}</div>
        <div class="prog-mgr-badge">${esc(p.source)}</div>
      </div>
      <div class="prog-mgr-actions">
        <button class="btn-secondary btn-sm rename-prog-btn" data-id="${p.id}">Rename</button>
        <button class="btn-secondary btn-sm edit-blocks-btn" data-id="${p.id}">${expandedId === p.id ? 'Close' : 'Edit'}</button>
        <button class="btn-icon delete-prog-btn" data-id="${p.id}" aria-label="Delete ${esc(p.name)}">✕</button>
      </div>
    </div>`;
}

function setupManagerEvents(container) {
  container.querySelector('#add-programme-btn')?.addEventListener('click', async () => {
    const name = prompt('Name for the new programme:', '');
    if (name === null) return; // cancelled
    try {
      const entry = await createProgramme(name.trim());
      expandedId = entry.id;
      showToast(`Programme ${entry.id} created`);
      await renderProgrammeManager(container);
    } catch (err) {
      showToast(err.message);
    }
  });

  container.querySelectorAll('.rename-prog-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.prog-mgr-row');
      const current = row.querySelector('.prog-mgr-name').textContent;
      const name = prompt('Rename programme:', current);
      if (name === null || !name.trim()) return;
      await renameProgramme(btn.dataset.id, name.trim());
      showToast('Renamed');
      await renderProgrammeManager(container);
    });
  });

  container.querySelectorAll('.edit-blocks-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      expandedId = expandedId === btn.dataset.id ? null : btn.dataset.id;
      await renderProgrammeManager(container);
    });
  });

  container.querySelectorAll('.delete-prog-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.prog-mgr-row');
      const name = row.querySelector('.prog-mgr-name').textContent;
      if (!confirm(`Delete "${name}"? Past workouts/journal/PR entries logged under it are kept, but it will no longer appear on the Today tab.`)) return;
      try {
        await deleteProgramme(btn.dataset.id);
        if (expandedId === btn.dataset.id) expandedId = null;
        showToast('Deleted');
        await renderProgrammeManager(container);
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}
```

(`renderBlockEditor` is referenced but not yet defined — that's Task 7. This file is not yet syntax-valid on its own until Task 7 lands; that's expected for this intermediate step, so skip the syntax-check/commit here and continue straight into Task 7. This is the one task in this plan that doesn't end with its own commit, because the file isn't independently valid yet.)

---

## Task 7: `js/programme-editor.js` — block builder shell + simple block forms (warmup/core/mobility)

**Files:**
- Modify: `js/programme-editor.js`

**Interfaces:**
- Consumes: `getSessions`, `saveSessions`, `BLOCK_TYPES` from `js/programmes.js`
- Produces: `renderBlockEditor(container, progId)` (called from Task 6's `renderProgrammeManager`)

- [ ] **Step 1: Add imports and day-tab module state**

At the top of `js/programme-editor.js`, change:
```js
import { listProgrammes, createProgramme, renameProgramme, deleteProgramme, MAX_PROGRAMMES } from './programmes.js';
```
to:
```js
import { listProgrammes, createProgramme, renameProgramme, deleteProgramme, getSessions, saveSessions, BLOCK_TYPES, MAX_PROGRAMMES } from './programmes.js';
```

Add near `let expandedId = null;`:
```js
let editorDay = 1; // 1=Mon .. 6=Sat, 0=Sun — matches the rest of the app's day numbering
let editingBlocks = []; // working copy of the open day's blocks array
const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
```

- [ ] **Step 2: `renderBlockEditor` — day tabs + block list + add-block row**

Append to `js/programme-editor.js`:

```js
function defaultBlockFor(type) {
  switch (type) {
    case 'warmup':   return { type, items: [] };
    case 'core':     return { type, items: [] };
    case 'skill':    return { type, name: '', note: '', exercises: [] };
    case 'strength': return { type, label: '', exercises: [] };
    case 'circuit':  return { type, label: '', exercises: [] };
    case 'cardio':   return { type, label: '', target: '', bpmTarget: '', note: '' };
    case 'mobility': return { type, label: '' };
    default: throw new Error(`Unknown block type: ${type}`);
  }
}

export async function renderBlockEditor(container, progId) {
  const mount = container.querySelector('#block-editor-mount');
  if (!mount) return;
  const sessions = await getSessions(progId);
  const day = sessions[editorDay] ?? { label: 'Rest', focus: 'Recovery', blocks: [] };
  editingBlocks = day.blocks.map(b => JSON.parse(JSON.stringify(b)));

  mount.innerHTML = `
    <div class="block-day-tabs">
      ${[1,2,3,4,5,6,0].map(d => `
        <button class="ctrl-pill day-pill ${editorDay === d ? 'active' : ''}" data-edday="${d}">${DAY_LABELS[d]}</button>
      `).join('')}
    </div>
    <div class="form-grid" style="margin-bottom:.5rem">
      <div class="form-group"><label>Day Label</label>
        <input type="text" id="ed-day-label" class="input-field" value="${day.label ? day.label.replace(/"/g, '&quot;') : ''}" placeholder="e.g. Pull Skill + Vertical Strength"></div>
      <div class="form-group"><label>Focus</label>
        <input type="text" id="ed-day-focus" class="input-field" value="${day.focus ? day.focus.replace(/"/g, '&quot;') : ''}" placeholder="e.g. Front Lever · Muscle-Up · Back"></div>
    </div>
    <div class="block-list" id="block-list">
      ${editingBlocks.map((b, bi) => blockCardHTML(b, bi)).join('') || '<p class="muted" style="font-size:.8rem">No blocks yet — Rest day, or add one below.</p>'}
    </div>
    <div class="block-add-row">
      <select id="add-block-type" class="input-field">
        ${BLOCK_TYPES.map(t => `<option value="${t.type}">${t.label}</option>`).join('')}
      </select>
      <button class="btn-secondary" id="add-block-btn">+ Add Block</button>
    </div>
    <p class="muted" style="font-size:.75rem;margin:.5rem 0">Switching days without saving discards unsaved edits on this day.</p>
    <button class="btn-primary" id="save-day-btn" style="width:100%">Save Day</button>
  `;
  setupBlockEditorEvents(container, progId);
}

function blockCardHTML(b, bi) {
  const cfg = BLOCK_TYPES.find(t => t.type === b.type);
  return `
    <div class="block-card" data-bi="${bi}">
      <div class="block-card-header">
        <span class="block-type-badge">${cfg.label}</span>
        <div class="block-card-actions">
          <button class="btn-icon move-block-up" data-bi="${bi}" aria-label="Move up">↑</button>
          <button class="btn-icon move-block-down" data-bi="${bi}" aria-label="Move down">↓</button>
          <button class="btn-icon remove-block" data-bi="${bi}" aria-label="Remove block">✕</button>
        </div>
      </div>
      ${blockBodyHTML(b, bi, cfg.kind)}
    </div>`;
}

function blockBodyHTML(b, bi, kind) {
  if (kind === 'items') return itemsBlockHTML(b, bi);
  if (kind === 'mobility') return mobilityBlockHTML(b, bi);
  if (kind === 'cardio') return cardioBlockHTML(b, bi);
  return exerciseBlockHTML(b, bi, kind); // 'skill' | 'strength' | 'circuit' — Task 8
}

function itemsBlockHTML(b, bi) {
  const items = b.items || [];
  return `
    <div class="edit-list" id="block-${bi}-items">
      ${items.map((item, xi) => `
        <div class="edit-list-item" data-bi="${bi}" data-xi="${xi}">
          <input type="text" class="input-field blk-item-in" value="${item.replace(/"/g, '&quot;')}" data-bi="${bi}" data-xi="${xi}">
          <button class="btn-icon rem-blk-item" data-bi="${bi}" data-xi="${xi}" aria-label="Remove item">✕</button>
        </div>`).join('')}
    </div>
    <button class="btn-secondary btn-sm add-blk-item" data-bi="${bi}">+ Add Item</button>`;
}

function mobilityBlockHTML(b, bi) {
  return `
    <div class="block-card-fields">
      <input type="text" class="input-field blk-label-in" data-bi="${bi}" value="${(b.label || '').replace(/"/g, '&quot;')}" placeholder="e.g. Mobility Session 1 — Upper body (~45 min)">
    </div>`;
}

function cardioBlockHTML(b, bi) {
  return `
    <div class="block-card-fields">
      <input type="text" class="input-field blk-label-in" data-bi="${bi}" value="${(b.label || '').replace(/"/g, '&quot;')}" placeholder="Label, e.g. Zone 2 Run">
      <input type="text" class="input-field blk-target-in" data-bi="${bi}" value="${(b.target || '').replace(/"/g, '&quot;')}" placeholder="Target, e.g. 35-40 min">
      <input type="text" class="input-field blk-bpm-in" data-bi="${bi}" value="${(b.bpmTarget || '').replace(/"/g, '&quot;')}" placeholder="BPM target, e.g. 130-145">
      <input type="text" class="input-field blk-note-in" data-bi="${bi}" value="${(b.note || '').replace(/"/g, '&quot;')}" placeholder="Note (optional)">
    </div>`;
}
```

- [ ] **Step 3: Wire day-switching, block add/remove/move, and items/mobility/cardio field edits**

Append:

```js
// Persistent elements (day tabs, add-block row, save button) are bound ONCE per
// renderBlockEditor call. Only #block-list is replaced by refreshBlockList, so its
// handlers live in bindBlockListEvents and are the only ones re-bound on every
// add/remove/move — re-running this whole function from refreshBlockList would
// duplicate-bind the persistent elements and make them fire multiple times per click.
function setupBlockEditorEvents(container, progId) {
  container.querySelectorAll('[data-edday]').forEach(btn => {
    btn.addEventListener('click', async () => {
      editorDay = +btn.dataset.edday;
      await renderBlockEditor(container, progId);
    });
  });

  container.querySelector('#add-block-btn')?.addEventListener('click', () => {
    const type = container.querySelector('#add-block-type').value;
    editingBlocks.push(defaultBlockFor(type));
    refreshBlockList(container, progId);
  });

  container.querySelector('#save-day-btn')?.addEventListener('click', async () => {
    readBlocksFromDom(container);
    const sessions = await getSessions(progId);
    const label = container.querySelector('#ed-day-label')?.value || '';
    const focus = container.querySelector('#ed-day-focus')?.value || '';
    sessions[editorDay] = { label, focus, blocks: editingBlocks };
    await saveSessions(progId, sessions);
    showToast('Day saved');
  });

  bindBlockListEvents(container, progId);
}

// Scoped to elements inside #block-list only — safe to call repeatedly (refreshBlockList
// calls this after every mutation, never the full setupBlockEditorEvents above).
function bindBlockListEvents(container, progId) {
  container.querySelectorAll('.remove-block').forEach(btn => {
    btn.addEventListener('click', () => {
      editingBlocks.splice(+btn.dataset.bi, 1);
      refreshBlockList(container, progId);
    });
  });

  container.querySelectorAll('.move-block-up').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.bi;
      if (i === 0) return;
      [editingBlocks[i - 1], editingBlocks[i]] = [editingBlocks[i], editingBlocks[i - 1]];
      refreshBlockList(container, progId);
    });
  });

  container.querySelectorAll('.move-block-down').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.bi;
      if (i === editingBlocks.length - 1) return;
      [editingBlocks[i + 1], editingBlocks[i]] = [editingBlocks[i], editingBlocks[i + 1]];
      refreshBlockList(container, progId);
    });
  });

  container.querySelectorAll('.add-blk-item').forEach(btn => {
    btn.addEventListener('click', () => {
      readBlocksFromDom(container); // capture any in-progress edits before mutating
      const bi = +btn.dataset.bi;
      (editingBlocks[bi].items ||= []).push('');
      refreshBlockList(container, progId);
    });
  });

  container.querySelectorAll('.rem-blk-item').forEach(btn => {
    btn.addEventListener('click', () => {
      readBlocksFromDom(container);
      editingBlocks[+btn.dataset.bi].items.splice(+btn.dataset.xi, 1);
      refreshBlockList(container, progId);
    });
  });

  setupExerciseBlockEvents(container, progId); // Task 8 — also scoped to #block-list
}

function refreshBlockList(container, progId) {
  const list = container.querySelector('#block-list');
  if (list) list.innerHTML = editingBlocks.map((b, bi) => blockCardHTML(b, bi)).join('') || '<p class="muted" style="font-size:.8rem">No blocks yet — Rest day, or add one below.</p>';
  bindBlockListEvents(container, progId); // re-bind ONLY block-list-scoped handlers
}

// Reads every block-level + sub-row field currently in the DOM back into `editingBlocks`,
// so in-progress keystrokes survive add/remove/move actions on OTHER blocks.
function readBlocksFromDom(container) {
  container.querySelectorAll('.block-card').forEach(card => {
    const bi = +card.dataset.bi;
    const b = editingBlocks[bi];
    if (!b) return;
    if (b.items) {
      b.items = [...card.querySelectorAll('.blk-item-in')].map(i => i.value);
    }
    const labelIn = card.querySelector('.blk-label-in');
    if (labelIn) b.label = labelIn.value;
    const targetIn = card.querySelector('.blk-target-in');
    if (targetIn) b.target = targetIn.value;
    const bpmIn = card.querySelector('.blk-bpm-in');
    if (bpmIn) b.bpmTarget = bpmIn.value;
    const noteIn = card.querySelector('.blk-note-in');
    if (noteIn && b.type === 'cardio') b.note = noteIn.value;
    const nameIn = card.querySelector('.blk-skill-name-in');
    if (nameIn) b.name = nameIn.value;
    const skillNoteIn = card.querySelector('.blk-skill-note-in');
    if (skillNoteIn) b.note = skillNoteIn.value;
    if (b.exercises) {
      readExerciseRows(card, b); // Task 8
    }
  });
}
```

Note: `setupExerciseBlockEvents` and `readExerciseRows` are referenced here but defined in Task 8 — same as Task 6, this file isn't independently valid until Task 8 lands. Continue straight into Task 8 without a syntax-check/commit here.

---

## Task 8: `js/programme-editor.js` — rich block forms (skill/strength/circuit) + exercise-row editing

**Files:**
- Modify: `js/programme-editor.js`

- [ ] **Step 1: Exercise-row field configs and HTML generator**

Append:

```js
// Field configs per exercise-bearing block kind — drives both rendering and DOM-read-on-save.
const EXERCISE_FIELDS = {
  skill:    [{ key: 'name', placeholder: 'Exercise name', cls: 'blk-ex-name' },
             { key: 'sets', placeholder: 'sets', cls: 'blk-ex-sets blk-ex-num', type: 'number' },
             { key: 'target', placeholder: 'target e.g. 8s', cls: 'blk-ex-target' },
             { key: 'note', placeholder: 'note (optional)', cls: 'blk-ex-note' }],
  strength: [{ key: 'name', placeholder: 'Exercise name', cls: 'blk-ex-name' },
             { key: 'sets', placeholder: 'sets', cls: 'blk-ex-sets blk-ex-num', type: 'number' },
             { key: 'reps', placeholder: 'reps e.g. 8 or 10e', cls: 'blk-ex-reps' },
             { key: 'note', placeholder: 'note (optional)', cls: 'blk-ex-note' }],
  circuit:  [{ key: 'name', placeholder: 'Exercise name', cls: 'blk-ex-name' },
             { key: 'reps', placeholder: 'reps e.g. 8', cls: 'blk-ex-reps' }],
};

function exerciseBlockHTML(b, bi, kind) {
  const fields = EXERCISE_FIELDS[kind];
  const exercises = b.exercises || [];
  const header = kind === 'skill'
    ? `<div class="block-card-fields">
        <input type="text" class="input-field blk-skill-name-in" data-bi="${bi}" value="${(b.name || '').replace(/"/g, '&quot;')}" placeholder="Skill name, e.g. Front Lever">
        <input type="text" class="input-field blk-skill-note-in" data-bi="${bi}" value="${(b.note || '').replace(/"/g, '&quot;')}" placeholder="Note (optional)">
      </div>`
    : `<div class="block-card-fields">
        <input type="text" class="input-field blk-label-in" data-bi="${bi}" value="${(b.label || '').replace(/"/g, '&quot;')}" placeholder="Label (optional)">
      </div>`;
  return `
    ${header}
    <div id="block-${bi}-exercises">
      ${exercises.map((ex, xi) => exerciseRowHTML(ex, bi, xi, fields)).join('')}
    </div>
    <button class="btn-secondary btn-sm add-blk-exercise" data-bi="${bi}">+ Add Exercise</button>`;
}

function exerciseRowHTML(ex, bi, xi, fields) {
  return `
    <div class="blk-ex-row" data-bi="${bi}" data-xi="${xi}">
      ${fields.map(f => `<input type="${f.type || 'text'}" class="input-field ${f.cls}" data-bi="${bi}" data-xi="${xi}" data-field="${f.key}" value="${String(ex[f.key] ?? '').replace(/"/g, '&quot;')}" placeholder="${f.placeholder}">`).join('')}
      <button class="btn-icon rem-blk-exercise" data-bi="${bi}" data-xi="${xi}" aria-label="Remove exercise">✕</button>
    </div>`;
}

function readExerciseRows(card, b) {
  const kind = b.type;
  const fields = EXERCISE_FIELDS[kind];
  if (!fields) return;
  b.exercises = [...card.querySelectorAll('.blk-ex-row')].map(row => {
    const ex = {};
    fields.forEach(f => {
      const input = row.querySelector(`[data-field="${f.key}"]`);
      const val = input?.value ?? '';
      if (f.type === 'number') { if (val !== '') ex[f.key] = parseInt(val, 10); }
      else if (val !== '') ex[f.key] = val;
    });
    return ex;
  });
}
```

- [ ] **Step 2: Wire add/remove exercise rows**

Append:

```js
function setupExerciseBlockEvents(container, progId) {
  container.querySelectorAll('.add-blk-exercise').forEach(btn => {
    btn.addEventListener('click', () => {
      readBlocksFromDom(container);
      const bi = +btn.dataset.bi;
      (editingBlocks[bi].exercises ||= []).push({});
      refreshBlockList(container, progId);
    });
  });

  container.querySelectorAll('.rem-blk-exercise').forEach(btn => {
    btn.addEventListener('click', () => {
      readBlocksFromDom(container);
      editingBlocks[+btn.dataset.bi].exercises.splice(+btn.dataset.xi, 1);
      refreshBlockList(container, progId);
    });
  });
}
```

- [ ] **Step 3: Syntax-check the whole file (first point where it's fully self-consistent)**

Run: `node --input-type=module < js/programme-editor.js`
Expected: only `ERR_MODULE_NOT_FOUND` for `./db.js`/`./programmes.js`, no `SyntaxError`. If there is one, the most likely cause is a function referenced before its definition is appended in the wrong order — check that every function named in Tasks 6-8 actually exists in the file (`grep -n "^function \|^async function \|^export " js/programme-editor.js`).

- [ ] **Step 4: Manual verification**

With `vercel dev` running, navigate to Settings (not yet wired into the page — temporarily test by pasting into the browser console):

```js
const container = document.querySelector('main');
const m = await import('/js/programme-editor.js');
container.innerHTML = '<div id="programme-manager-mount"></div>';
await m.renderProgrammeManager(container);
```

Expected: Programme A and B rows appear, each with Rename/Edit/Delete. Click "Edit" on A — block builder expands below with Mon-Sun day tabs, Day 3 ("Pull Skill...") shows its 5 blocks (warmup/skill/skill/strength/core) with all fields populated matching `PROG_A_SESSIONS[3]`. Add a new `warmup` block, add two items to it, click Save Day, re-open Edit — confirm the new block persisted. Add a new exercise row to the strength block, fill in name/sets/reps, Save Day, re-open — confirm it persisted.

- [ ] **Step 5: Commit**

```bash
git add js/programme-editor.js
git commit -m "feat: programme manager + manual block builder UI (all 7 block types)"
```

---

## Task 9: `js/programme-editor.js` — upload (JSON simple + advanced blocks, PDF, Word), moved & generalized from settings.js

**Files:**
- Modify: `js/programme-editor.js`

**Interfaces:**
- Consumes: `getSessions`, `saveSessions` from `js/programmes.js`
- Produces: `renderUploadSection(progId)` (HTML string), `setupUploadEvents(container, progId, onDone)` — both called from the block editor for whichever programme is `expandedId`

- [ ] **Step 1: Add the upload UI under the block editor's day tabs**

In `renderBlockEditor` (Task 7, Step 2), find:
```js
    <p class="muted" style="font-size:.75rem;margin:.5rem 0">Switching days without saving discards unsaved edits on this day.</p>
    <button class="btn-primary" id="save-day-btn" style="width:100%">Save Day</button>
  `;
  setupBlockEditorEvents(container, progId);
}
```
Replace with:
```js
    <p class="muted" style="font-size:.75rem;margin:.5rem 0">Switching days without saving discards unsaved edits on this day.</p>
    <button class="btn-primary" id="save-day-btn" style="width:100%">Save Day</button>
    <hr style="border-color:var(--border);margin:1rem 0">
    ${renderUploadSection(progId)}
  `;
  setupBlockEditorEvents(container, progId);
  setupUploadEvents(container, progId, () => renderBlockEditor(container, progId));
}
```

- [ ] **Step 2: Upload section HTML + simple JSON/PDF/Word parsing + advanced JSON path**

Append:

```js
function renderUploadSection(progId) {
  return `
    <p class="muted" style="font-size:.8rem;margin-bottom:.5rem">
      Upload a <strong>PDF</strong>, <strong>Word</strong>, or <strong>JSON</strong> file to fill this programme's week.
      PDF/Word and simple JSON produce one Strength block per day (refine with the block builder above).
      JSON with a full <code>blocks</code> array per day is used exactly as written — full one-shot detail.
    </p>
    <div class="add-item-row" style="margin-bottom:.5rem">
      <button class="btn-primary" id="upload-prog-btn" style="flex:1">📋 Upload Programme</button>
      <button class="btn-secondary" id="download-prog-template">⬇ Template</button>
    </div>
    <input type="file" id="upload-prog-input" accept=".pdf,.doc,.docx,.json" style="display:none">
    <div id="upload-prog-status" style="font-size:.85rem"></div>
  `;
}

const PROG_DAY_MAP = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

// Simple flat shape: { name, description, days: { Monday: { label, exercises: [{name,sets,reps}|string] } } }
// Advanced shape: same, but a day may have `blocks: [...]` instead of `exercises` — used verbatim.
async function importJsonProgramme(file, progId) {
  const text = await file.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Invalid JSON file'); }
  if (!data.days || typeof data.days !== 'object') throw new Error('Missing "days" field — see template for format');

  const sessions = await getSessions(progId);
  for (const [dayName, dayData] of Object.entries(data.days)) {
    const dayNum = PROG_DAY_MAP[dayName.toLowerCase()];
    if (dayNum === undefined) throw new Error(`Unknown day "${dayName}" — use Monday, Tuesday, etc.`);
    if (Array.isArray(dayData.blocks)) {
      sessions[dayNum] = { label: dayData.label || '', focus: dayData.focus || '', blocks: dayData.blocks };
    } else {
      const exercises = (dayData.exercises || []).map(ex =>
        typeof ex === 'string' ? { name: ex } : { name: ex.name, sets: ex.sets, reps: ex.reps ? String(ex.reps) : undefined }
      );
      sessions[dayNum] = { label: dayData.label || '', focus: '', blocks: exercises.length ? [{ type: 'strength', exercises }] : [] };
    }
  }
  await saveSessions(progId, sessions);
}

function wrapParsedDaysAsBlocks(parsedDays) {
  // parsedDays: { [dayNum]: { label, exercises: [{name, sets?, reps?}] } } — from PDF/Word text parsing
  const sessions = {};
  for (const [day, data] of Object.entries(parsedDays)) {
    sessions[day] = {
      label: data.label || '',
      focus: '',
      blocks: data.exercises.length ? [{ type: 'strength', exercises: data.exercises }] : [],
    };
  }
  return sessions;
}

async function loadMammoth() {
  if (window.mammoth) return window.mammoth;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
    s.onload = () => resolve(window.mammoth);
    s.onerror = () => reject(new Error('Could not load Word parser — check internet connection'));
    document.head.appendChild(s);
  });
}

async function extractDocxText(file) {
  if (file.name.toLowerCase().endsWith('.doc') && !file.name.toLowerCase().endsWith('.docx')) {
    throw new Error('Old .doc format is not supported — please save as .docx in Word and try again');
  }
  const mammoth = await loadMammoth();
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  if (!result.value?.trim()) throw new Error('Could not read Word document — make sure it is a .docx file');
  return result.value;
}

async function loadPdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(window.pdfjsLib);
    };
    s.onerror = () => reject(new Error('Could not load PDF parser — check internet connection'));
    document.head.appendChild(s);
  });
}

async function extractPdfText(file) {
  const pdfjsLib = await loadPdfJs();
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pageTexts = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const byY = {};
    for (const item of content.items) {
      const y = Math.round(item.transform[5] / 4) * 4;
      (byY[y] = byY[y] || []).push(item);
    }
    const lines = Object.keys(byY).map(Number).sort((a, b) => b - a)
      .map(y => byY[y].sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(' ').trim())
      .filter(Boolean);
    pageTexts.push(lines.join('\n'));
  }
  return pageTexts.join('\n');
}

function parseProgrammeText(text) {
  const DAY_MAP = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };
  const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
  const days = {};
  let currentDay = null;

  for (const line of lines) {
    const lower = line.toLowerCase();
    const dayKey = Object.keys(DAY_MAP).find(d => lower.startsWith(d) && (lower.length === d.length || /[\s:–\-,\/]/.test(lower[d.length])));
    if (dayKey) {
      const dayNum = DAY_MAP[dayKey];
      const rest = line.substring(dayKey.length).replace(/^[\s:–\-]+/, '').trim();
      currentDay = dayNum;
      if (!days[dayNum]) days[dayNum] = { label: rest || '', exercises: [] };
      else if (rest && !days[dayNum].label) days[dayNum].label = rest;
      continue;
    }
    const dayNumMatch = line.match(/^day\s+([1-7])\b/i);
    if (dayNumMatch) {
      const n = parseInt(dayNumMatch[1]);
      const dayNum = [1, 2, 3, 4, 5, 6, 0][(n - 1) % 7];
      const rest = line.substring(dayNumMatch[0].length).replace(/^[\s:–\-]+/, '').trim();
      currentDay = dayNum;
      if (!days[dayNum]) days[dayNum] = { label: rest || `Day ${n}`, exercises: [] };
      continue;
    }
    if (currentDay === null) continue;
    if (/^(sets?|reps?|weight|exercise|week|phase|notes?|tempo|rest)\s*$/i.test(line)) continue;
    if (line.length < 3 || line.length > 80) continue;

    const srPatterns = [
      /(\d+)\s*[x×X]\s*([\d]+[\-–][\d]+|\d+)/,
      /(\d+)\s+sets?\s+(?:of\s+)?([\d]+[\-–][\d]+|\d+)\s*reps?/i,
      /(\d+)\s*sets?[,\s]+([\d]+[\-–][\d]+|\d+)\s*reps?/i,
    ];
    let sets = null, reps = null, exerciseName = line;
    for (const pat of srPatterns) {
      const m = line.match(pat);
      if (m) {
        sets = parseInt(m[1]);
        reps = m[2].replace('–', '-');
        exerciseName = (line.slice(0, m.index) + line.slice(m.index + m[0].length)).replace(/[-–:,]+$/, '').trim();
        break;
      }
    }
    exerciseName = exerciseName.replace(/^[-•*·◦▪▸\d.)\s]+/, '').trim();
    if (exerciseName.length >= 3 && exerciseName.length <= 60 && !/^\d+(\.\d+)?$/.test(exerciseName)) {
      const ex = { name: exerciseName };
      if (sets) ex.sets = sets;
      if (reps) ex.reps = reps;
      days[currentDay].exercises.push(ex);
    }
  }
  return days;
}
```

- [ ] **Step 3: Wire upload events**

Append:

```js
function setupUploadEvents(container, progId, onDone) {
  container.querySelector('#upload-prog-btn')?.addEventListener('click', () => {
    container.querySelector('#upload-prog-input')?.click();
  });

  container.querySelector('#upload-prog-input')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const status = container.querySelector('#upload-prog-status');
    e.target.value = '';

    const name = file.name.toLowerCase();
    const isPdf = name.endsWith('.pdf') || file.type === 'application/pdf';
    const isWord = name.endsWith('.docx') || name.endsWith('.doc') ||
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.type === 'application/msword';

    try {
      if (isPdf || isWord) {
        status.textContent = isPdf ? 'Parsing PDF…' : 'Parsing Word document…';
        status.style.color = 'var(--muted)';
        const text = isPdf ? await extractPdfText(file) : await extractDocxText(file);
        const parsedDays = parseProgrammeText(text);
        const totalEx = Object.values(parsedDays).reduce((n, d) => n + d.exercises.length, 0);
        if (totalEx === 0) {
          status.textContent = '⚠ No exercises detected. Make sure your document has day names (Monday, Tuesday…) followed by exercise lines.';
          status.style.color = 'var(--warning, #ffd700)';
          return;
        }
        const sessions = await getSessions(progId);
        Object.assign(sessions, wrapParsedDaysAsBlocks(parsedDays));
        await saveSessions(progId, sessions);
        status.textContent = `✓ Parsed ${totalEx} exercises into Strength blocks — refine with the block builder above.`;
        status.style.color = 'var(--success)';
        onDone();
      } else {
        status.textContent = 'Reading…';
        status.style.color = 'var(--muted)';
        await importJsonProgramme(file, progId);
        status.textContent = '✓ Programme loaded';
        status.style.color = 'var(--success)';
        onDone();
      }
    } catch (err) {
      status.textContent = '✕ ' + err.message;
      status.style.color = 'var(--danger)';
    }
  });

  container.querySelector('#download-prog-template')?.addEventListener('click', () => {
    const template = {
      name: 'My Programme',
      description: 'Optional — e.g. 4-day upper/lower split',
      days: {
        Monday: { label: 'Push', exercises: [{ name: 'Bench Press', sets: 4, reps: '6-8' }, { name: 'Overhead Press', sets: 3, reps: '8-10' }] },
        Tuesday: { label: 'Pull', exercises: [{ name: 'Pull-up', sets: 4, reps: '6-8' }, { name: 'Barbell Row', sets: 3, reps: '8-10' }] },
        Wednesday: { label: 'Rest', exercises: [] },
        Thursday: { label: 'Legs', exercises: [{ name: 'Back Squat', sets: 4, reps: '6-8' }] },
        Friday: { label: 'Upper', exercises: [{ name: 'Incline Bench Press', sets: 3, reps: '8-10' }] },
        Saturday: { label: 'Rest', exercises: [] },
        Sunday: {
          label: 'Advanced example — full block control', focus: 'Optional',
          blocks: [
            { type: 'warmup', items: ['Light walk — 5 min', 'Dynamic stretches — 5 min'] },
            { type: 'skill', name: 'Example Skill', exercises: [{ name: 'Hold progression', sets: 5, target: '10s' }] },
          ],
        },
      },
    };
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mystats-programme-template.json';
    a.click();
    showToast('Template downloaded!');
  });
}
```

- [ ] **Step 4: Syntax-check**

Run: `node --input-type=module < js/programme-editor.js`
Expected: only `ERR_MODULE_NOT_FOUND`, no `SyntaxError`.

- [ ] **Step 5: Manual verification**

Using the same console-driven render from Task 8 Step 4, open Edit on a programme, click "⬇ Template", confirm `mystats-programme-template.json` downloads with a `Sunday.blocks` array present (the advanced example). Click "📋 Upload Programme", select that same downloaded file, confirm Monday-Saturday become single-Strength-block days and Sunday gets the exact `warmup`+`skill` blocks from the template (full parity — proves the advanced JSON path bypasses the auto-wrap).

- [ ] **Step 6: Commit**

```bash
git add js/programme-editor.js
git commit -m "feat: programme upload (JSON simple+advanced, PDF, Word) generalized to any programme id"
```

---

## Task 10: `js/settings.js` — remove the old A/B sections, wire in the new Programmes section

**Files:**
- Modify: `js/settings.js`

- [ ] **Step 1: Update imports**

Find:
```js
import { dbGet, dbPut, dbAdd, dbGetAll, dbDelete, dbClear, esc } from './db.js';
import { MORNING_ROUTINE, SUPPLEMENTS, PROGRAMME_A, PROGRAMME_B, TARGETS, DEFAULT_CHECKLIST_ITEMS, ALL_EXERCISES, SCAN_HISTORY } from './profile.js';
import { getChecklistItems, getMorningRoutine, getSupplements, getProgrammeSchedule, getTargets, getUserProfile, getProgrammeMeta } from './config.js';
```
Replace with:
```js
import { dbGet, dbPut, dbAdd, dbGetAll, dbDelete, dbClear, esc } from './db.js';
import { MORNING_ROUTINE, SUPPLEMENTS, TARGETS, DEFAULT_CHECKLIST_ITEMS, ALL_EXERCISES, SCAN_HISTORY } from './profile.js';
import { getChecklistItems, getMorningRoutine, getSupplements, getTargets, getUserProfile } from './config.js';
import { renderProgrammeManager } from './programme-editor.js';
```

(`PROGRAMME_A`/`PROGRAMME_B` were already unused in `settings.js` beyond the deleted programme functions — confirm with `grep -n "PROGRAMME_A\|PROGRAMME_B" js/settings.js` after Step 2 returns nothing outside this import line.)

- [ ] **Step 2: Delete the old programme functions**

Delete these functions entirely from `js/settings.js` (they're fully superseded by `js/programme-editor.js`): `renderProgramme` (~line 216), `progExRow` (~line 239), `renderProgrammeUpload` (~line 330), `setupProgEvents` (~line 657), `addProgExercise` (~line 709), `importProgramme` (~line 790), `loadMammoth` (~line 826), `extractDocxText` (~line 837), `loadPdfJs` (~line 848), `extractPdfText` (~line 863), `parseProgrammeText` (~line 885), `showPdfReview` (~line 961), `saveParsedProgramme` (~line 1019), `setupProgrammeUploadEvents` (~line 1039). (Line numbers are approximate — locate by function name; this plan's earlier reads captured every one of these in full.)

- [ ] **Step 3: Replace the section list**

Find (in `renderSettings`):
```js
  const [checklistItems, routineSteps, supplements, schedA, schedB, targets, profile, bloodwork, metaA, metaB, apiKeyRecord] = await Promise.all([
    getChecklistItems(), getMorningRoutine(), getSupplements(),
    getProgrammeSchedule('A'), getProgrammeSchedule('B'),
    getTargets(), getUserProfile(), dbGetAll('bloodwork'),
    getProgrammeMeta('A'), getProgrammeMeta('B'),
    dbGet('settings', 'anthropic_api_key'),
  ]);
```
Replace with:
```js
  const [checklistItems, routineSteps, supplements, targets, profile, bloodwork, apiKeyRecord] = await Promise.all([
    getChecklistItems(), getMorningRoutine(), getSupplements(),
    getTargets(), getUserProfile(), dbGetAll('bloodwork'),
    dbGet('settings', 'anthropic_api_key'),
  ]);
```

Find:
```js
    ${section('progUpload',  '📋 Programme Upload',     renderProgrammeUpload(metaA, metaB))}
    ${section('progA',       '💪 Programme A Schedule', renderProgramme('A', schedA))}
    ${section('progB',       '💪 Programme B Schedule', renderProgramme('B', schedB))}
```
Replace with:
```js
    ${section('programmes',  '💪 Programmes',           '<div id="programme-manager-mount"></div>')}
```

Find:
```js
  setupEvents(container, { checklistItems, routineSteps, supplements, schedA, schedB, targets, profile, bloodwork, savedApiKey });
```
Replace with:
```js
  setupEvents(container, { checklistItems, routineSteps, supplements, targets, profile, bloodwork, savedApiKey });
  await renderProgrammeManager(container);
```

- [ ] **Step 4: Remove the now-deleted functions' calls from `setupEvents`**

Find:
```js
  setupProgrammeUploadEvents(container);
  setupProgEvents(container, 'A', data.schedA);
  setupProgEvents(container, 'B', data.schedB);
```
Delete those three lines (no replacement — `renderProgrammeManager` wires its own events internally, called separately in Step 3 above).

- [ ] **Step 5: Syntax-check**

Run: `node --input-type=module < js/settings.js`
Expected: only `ERR_MODULE_NOT_FOUND`, no `SyntaxError`. Then run `grep -n "getProgrammeSchedule\|getProgrammeMeta\|renderProgramme(\|setupProgEvents\|importProgramme\|parseProgrammeText" js/settings.js` — expected: no matches (confirms every reference was actually removed, not just the function definitions).

- [ ] **Step 6: Manual verification**

Start `vercel dev`, open the app, go to Setup tab, expand "💪 Programmes". Expected: the manager list (A, B) with Edit/Rename/Delete, exactly as console-tested in Task 8/9. Click "+ Add Programme", name it "Test C" — confirm it appears as a third row with id `C` and a `manual` badge, and the Today tab (separate navigation) now shows three pills: A, B, C.

- [ ] **Step 7: Commit**

```bash
git add js/settings.js
git commit -m "feat: settings.js — replace fixed A/B schedule UI with the generic programme manager"
```

---

## Task 11: `sw.js` — register new files, bump cache

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: Add the two new files to `ASSETS` and bump `CACHE`**

Find:
```js
const CACHE = 'mystats-v45';
const ASSETS = ['/', '/index.html', '/style.css', '/manifest.json', '/js/db.js', '/js/profile.js', '/js/config.js', '/js/onboarding.js', '/js/today.js', '/js/workout.js', '/js/running.js', '/js/bodyscan.js', '/js/progress.js', '/js/reminders.js', '/js/settings.js', '/js/app.js', '/js/recovery.js', '/js/journal.js', '/js/prs.js', '/icon-192.png', '/icon-512.png', '/favicon.ico'];
```
Replace with:
```js
const CACHE = 'mystats-v46';
const ASSETS = ['/', '/index.html', '/style.css', '/manifest.json', '/js/db.js', '/js/profile.js', '/js/config.js', '/js/onboarding.js', '/js/today.js', '/js/workout.js', '/js/running.js', '/js/bodyscan.js', '/js/progress.js', '/js/reminders.js', '/js/settings.js', '/js/app.js', '/js/recovery.js', '/js/journal.js', '/js/prs.js', '/js/programmes.js', '/js/programme-editor.js', '/icon-192.png', '/icon-512.png', '/favicon.ico'];
```

- [ ] **Step 2: Syntax-check**

Run: `node --input-type=module < sw.js` — this file isn't a module (`importScripts`-style service worker), so instead just run `node -c sw.js` (Node's plain syntax-check flag).
Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add sw.js
git commit -m "chore: register programmes.js + programme-editor.js in the service worker cache"
```

---

## Task 12: Deploy and full smoke-test

**Files:** none (verification only)

- [ ] **Step 1: Local full-flow smoke-test**

With `vercel dev --listen 3211` running and a fresh/imported IndexedDB:
1. Today tab — confirm A/B pills (plus any test programmes from earlier tasks — delete those first via Settings if you want a clean state matching production).
2. Settings → Programmes → "+ Add Programme" → name "Deload Week" → Edit → switch to a weekday → add a `warmup` block with 2 items, a `strength` block with 1 exercise (`Goblet Squat`, sets 3, reps 10) → Save Day.
3. Today tab — confirm the new programme's pill (next id, e.g. `C`) appears next to A/B, click it, Apply, confirm the session you just built renders with the warmup items and the strength exercise set/rep inputs.
4. Log a set on that exercise, Save Session — confirm the journal prompt still fires (regression check against last session's work) and the workout saves with `programme: 'C'`.
5. Settings → Programmes → delete "Deload Week" → confirm it disappears from the Today pill row and the remaining workout history is untouched (Progress tab session history still shows the logged "Deload Week" session by date, just no longer re-selectable as a live programme).
6. Settings → Programmes → Edit Programme A → confirm its full original content (all 7 days, all block types) still renders exactly as before this plan (proves the seed-from-hardcoded migration was lossless).

- [ ] **Step 2: Deploy**

```bash
vercel --prod --yes
```

- [ ] **Step 3: Production spot-check**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://mystats-pwa-ochre.vercel.app/js/programmes.js
curl -s -o /dev/null -w "%{http_code}\n" https://mystats-pwa-ochre.vercel.app/js/programme-editor.js
```
Expected: both `200`.

- [ ] **Step 4: Push**

```bash
git push origin main
```
