# Auto PR Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every set logged on the Today or Train tab is automatically checked against that exercise's current best; a new best writes a PR record and shows a celebratory toast, and a one-time backfill seeds the board from existing workout history.

**Architecture:** A single new pure-data module, `js/pr-detect.js`, holds the detection algorithm and the backfill migration — no DOM, callable from both `js/today.js` and `js/workout.js`'s save handlers. It reads/writes the existing `prs` IndexedDB store via the existing `js/db.js` helpers; no schema change.

**Tech Stack:** Same vanilla ES modules / IndexedDB / no-build-step approach as the rest of the app.

## Global Constraints

- No automated test framework exists in this repo. Every task's verification is manual: syntax-check with `node --input-type=module < path/to/file.js` (an `ERR_MODULE_NOT_FOUND` for a bare import is expected/OK; only a real `SyntaxError` is a failure), then a browser-driven check via `vercel dev` + Playwright MCP tools (or equivalent).
- No new IndexedDB stores or schema changes. PR records keep their existing shape exactly: `{exercise, type, value, unit, date, notes}` (see `js/prs.js`'s `dbAdd('prs', {...})` call). Auto-created records are indistinguishable from manual ones except `notes: 'Auto-logged'`.
- Ranking is the raw heaviest weight/highest reps/longest hold ever logged — no 1RM formula, no per-exercise settings toggle.
- One exercise name maps to exactly one PR `type` at a time, decided by a fixed priority order: weight > reps (bodyweight sets) > reps-or-hold (parsed from the skill `hold` string). This avoids `js/prs.js`'s `byExercise` grouping (which sorts all records for an exercise name together regardless of `type`) ever mixing incomparable units under one card.
- A strictly-greater value is required to count as a new PR — a tie is not an improvement.
- Only one new-PR record is written per exercise per session, even if multiple sets in that session beat the old best (the best set in the session counts once).
- Backfill runs once (settings-store flag `pr_backfill_done`), oldest-workout-first so "current best" accumulates correctly walking forward in time, and never shows a toast (toasts are for live saves only — the caller, not `scanForPRs` itself, decides whether to surface a toast).
- Every new/modified `.js` file must be registered in `sw.js`'s `ASSETS` array with `CACHE` bumped, or the PWA keeps serving stale cached files.
- Follow existing conventions: `esc()` from `js/db.js` isn't needed here (no HTML rendering in this feature — toasts use `textContent`, not `innerHTML`, in both `today.js`'s and `workout.js`'s existing local `showToast` functions). Reuse each file's own local `showToast` — no new shared toast module.

---

## Codebase Context (read before starting any task)

**The exercise-record shape** produced identically by both `js/today.js`'s `serializeBlockLog()` (today.js:114-130) and `js/workout.js`'s `currentSession.exercises` (built via the Train tab's exercise/set UI):
```js
{ name: 'Weighted pull-up', sets: [{ weight: 12.5, reps: '6', note: '' }], notes: '', hold: '', level: '' }   // strength (Today) — weight+reps numeric/string
{ name: 'Goblet Squat',     sets: [{ weight: 20,   reps: '10' }] }                                             // Train tab — no hold/level fields at all
{ name: 'Tuck front lever hold', sets: [], notes: '', hold: '8s', level: '' }                                  // skill, hold-based
{ name: 'Muscle-up negative',    sets: [], notes: '', hold: '3 reps', level: '' }                              // skill, rep-based — same `hold` field, different string shape
{ name: '_warmup', done: true, sets: [], notes: '' }                                                          // pseudo-exercise — skip (name starts with '_')
```
`sets[].weight` may be a number, a numeric string, `null`, or absent depending on which tab produced it — always run it through `parseFloat` and check `!isNaN(...)` before comparing. Same for `reps`.

**`js/db.js` exports used in this plan:** `dbGet(store, key)`, `dbPut(store, {key, value})`, `dbGetAll(store)`, `dbAdd(store, data)`.

**`js/prs.js`'s existing PR record shape and unit convention** (unchanged by this plan — just what this plan's output must match): `TYPE_CONFIG = { weight: {unit:'kg'}, reps: {unit:'reps'}, hold: {unit:'sec'}, skill: {unit:''} }` (js/prs.js:3-8). The rendered PR value uses `${value} ${unit}` (space-separated, e.g. `"15 kg"` — js/prs.js's `renderPRCard`). This plan never uses the `'skill'` type — skill exercises resolve to either `'hold'` or `'reps'` based on the logged string's suffix, per the Data flow section below.

**`js/app.js`'s current init sequence** (js/app.js:24-27):
```js
async function init() {
  try {
  await initDB();
  await ensureSeeded();
```
(`ensureSeeded` is the multi-programme-support work's seed-once call, imported from `./programmes.js` — this plan adds a sibling call the same way.)

**Save handlers this plan hooks into:**
- `js/today.js:767-786` — the `#save-today-log` click handler. Builds `workoutData` (includes `.exercises` and `.date` via `todayStr()`), then `dbPut`/`dbAdd`s it, shows a "Session updated!"/"Session saved!" toast via the file's local `showToast` (today.js:808), then calls `renderJournalPrompt(...)`.
- `js/workout.js:235-247` — the `#save-workout` click handler. Uses `currentSession.exercises`/`currentSession.date`, `dbPut`/`dbAdd`s it, shows a toast via the file's local `showToast` (workout.js:271), then **resets `currentSession` to a blank session before re-rendering** — any code needing the just-saved exercises/date must capture them into local variables before that reset.

---

## File Structure

| File | Action | Responsibility |
|------|--------|-----------------|
| `js/pr-detect.js` | **Create** | Detection algorithm (`scanForPRs`), toast-phrasing helper (`formatPRToast`), one-time backfill (`ensurePRBackfill`) |
| `js/app.js` | Modify | Call `ensurePRBackfill()` once during init, alongside the existing `ensureSeeded()` call |
| `js/today.js` | Modify | After a session save, call `scanForPRs` and show a toast if anything new was set |
| `js/workout.js` | Modify | Same integration as `today.js`, adapted to this file's save-handler shape |
| `sw.js` | Modify | Add `js/pr-detect.js` to `ASSETS`, bump `CACHE` |

---

## Task 1: `js/pr-detect.js` — detection algorithm, toast phrasing, backfill

**Files:**
- Create: `js/pr-detect.js`

**Interfaces:**
- Consumes: `dbGet`, `dbPut`, `dbGetAll`, `dbAdd` from `./db.js`
- Produces: `scanForPRs(exercises: Array<{name, sets?, hold?}>, date: string): Promise<Array<{exercise, type, value, unit, date, notes}>>`, `formatPRToast(newPRs: Array<{exercise, value, unit}>): string|null`, `ensurePRBackfill(): Promise<void>`

- [ ] **Step 1: Write `js/pr-detect.js`**

```js
import { dbGet, dbPut, dbGetAll, dbAdd } from './db.js';

// Turns one saved exercise record into a single rankable candidate, or null if
// nothing in it can be ranked (pseudo-exercises, or a block with no logged data).
// Priority order matches the plan's Global Constraints: weight > bodyweight reps > hold/rep-derived.
function detectCandidate(ex) {
  const sets = ex.sets || [];

  const weights = sets
    .map(s => parseFloat(s.weight))
    .filter(w => !isNaN(w) && w > 0);
  if (weights.length > 0) {
    return { type: 'weight', unit: 'kg', value: Math.max(...weights) };
  }

  const repsOnly = sets
    .map(s => parseFloat(s.reps))
    .filter(r => !isNaN(r) && r > 0);
  if (repsOnly.length > 0) {
    return { type: 'reps', unit: 'reps', value: Math.max(...repsOnly) };
  }

  if (ex.hold) {
    const m = String(ex.hold).match(/^(\d+(?:\.\d+)?)/);
    if (m) {
      const num = parseFloat(m[1]);
      const rest = String(ex.hold).slice(m[0].length).trim();
      const isSeconds = /^s/i.test(rest);
      return isSeconds ? { type: 'hold', unit: 'sec', value: num } : { type: 'reps', unit: 'reps', value: num };
    }
  }

  return null;
}

export async function scanForPRs(exercises, date) {
  const allPRs = await dbGetAll('prs');
  const bestFor = new Map(); // `${exercise}|${type}` -> current best value
  for (const pr of allPRs) {
    const key = `${pr.exercise}|${pr.type}`;
    const cur = bestFor.get(key);
    if (cur === undefined || pr.value > cur) bestFor.set(key, pr.value);
  }

  const newPRs = [];
  for (const ex of exercises) {
    if (!ex.name || ex.name.startsWith('_')) continue;
    const candidate = detectCandidate(ex);
    if (!candidate) continue;

    const key = `${ex.name}|${candidate.type}`;
    const best = bestFor.get(key);
    if (best === undefined || candidate.value > best) {
      const record = {
        exercise: ex.name,
        type: candidate.type,
        value: candidate.value,
        unit: candidate.unit,
        date,
        notes: 'Auto-logged',
      };
      await dbAdd('prs', record);
      newPRs.push(record);
      bestFor.set(key, candidate.value); // guards against the same exercise name appearing twice in one save
    }
  }
  return newPRs;
}

export function formatPRToast(newPRs) {
  if (!newPRs || newPRs.length === 0) return null;
  if (newPRs.length === 1) {
    const pr = newPRs[0];
    return `🏆 New PR: ${pr.exercise} ${pr.value} ${pr.unit}!`;
  }
  const parts = newPRs.map(pr => `${pr.exercise} ${pr.value} ${pr.unit}`).join(', ');
  return `🏆 ${newPRs.length} new PRs: ${parts}`;
}

export async function ensurePRBackfill() {
  const done = await dbGet('settings', 'pr_backfill_done');
  if (done) return;
  const allWorkouts = await dbGetAll('workouts');
  const sorted = [...allWorkouts].sort((a, b) => a.date.localeCompare(b.date));
  for (const w of sorted) {
    await scanForPRs(w.exercises || [], w.date);
  }
  await dbPut('settings', { key: 'pr_backfill_done', value: true });
}
```

- [ ] **Step 2: Syntax-check**

Run: `node --input-type=module < js/pr-detect.js`
Expected: only `ERR_MODULE_NOT_FOUND` for `./db.js`, no `SyntaxError`.

- [ ] **Step 3: Manual smoke-test via browser console**

Start `vercel dev --listen 3211` (or `python3 -m http.server 8080`), open the app, open devtools console, and run:

```js
const m = await import('/js/pr-detect.js');
console.log(await m.scanForPRs([{ name: 'Test Curl', sets: [{ weight: 10, reps: '10' }] }], '2026-07-01'));
```
Expected: an array with one record `{exercise:'Test Curl', type:'weight', unit:'kg', value:10, date:'2026-07-01', notes:'Auto-logged'}` (first time it's logged — no existing PR to beat).

Run it again with a lower weight:
```js
console.log(await m.scanForPRs([{ name: 'Test Curl', sets: [{ weight: 8, reps: '10' }] }], '2026-07-01'));
```
Expected: `[]` (8 does not beat the 10 just recorded).

Run it again with a higher weight:
```js
console.log(await m.scanForPRs([{ name: 'Test Curl', sets: [{ weight: 12, reps: '10' }] }], '2026-07-01'));
```
Expected: a new record with `value: 12`.

Test the hold-parsing branch:
```js
console.log(await m.scanForPRs([{ name: 'Test Hold', sets: [], hold: '8s' }], '2026-07-01'));
console.log(m.formatPRToast([{ exercise: 'Test Curl', value: 12, unit: 'kg' }]));
console.log(m.formatPRToast([{ exercise: 'Test Curl', value: 12, unit: 'kg' }, { exercise: 'Test Hold', value: 8, unit: 'sec' }]));
```
Expected: first call returns a `{type:'hold', unit:'sec', value:8}` record; the two `formatPRToast` calls return `"🏆 New PR: Test Curl 12 kg!"` and `"🏆 2 new PRs: Test Curl 12 kg, Test Hold 8 sec"` respectively.

Clean up your test data afterward (delete the `Test Curl`/`Test Hold` PR entries via the PRs tab, or clear IndexedDB) so it doesn't linger in the dev database.

- [ ] **Step 4: Commit**

```bash
git add js/pr-detect.js
git commit -m "feat: PR detection algorithm — scan sets for new records, backfill migration"
```

---

## Task 2: `js/app.js` — wire in the backfill

**Files:**
- Modify: `js/app.js`

**Interfaces:**
- Consumes: `ensurePRBackfill()` from `js/pr-detect.js` (Task 1)

- [ ] **Step 1: Add the import and the call**

Find:
```js
import { initDB, dbGetAll, dbGet, dbPut } from './db.js';
import { ensureSeeded } from './programmes.js';
```
Replace with:
```js
import { initDB, dbGetAll, dbGet, dbPut } from './db.js';
import { ensureSeeded } from './programmes.js';
import { ensurePRBackfill } from './pr-detect.js';
```

Find:
```js
  await initDB();
  await ensureSeeded();
```
Replace with:
```js
  await initDB();
  await ensureSeeded();
  await ensurePRBackfill();
```

- [ ] **Step 2: Syntax-check**

Run: `node --input-type=module < js/app.js`
Expected: only `ERR_MODULE_NOT_FOUND`, no `SyntaxError`.

- [ ] **Step 3: Manual verification**

Import the existing `mystats-backup-2026-05-20.json` (or any backup with real workout history) into a fresh IndexedDB (devtools → Application → IndexedDB → delete `mystats` first, then reload and use the onboarding screen's "Import Existing Backup"), then check the PRs tab — it should already show entries derived from that history, without you having logged anything new. Reload the page again afterward and confirm the PRs tab doesn't duplicate/change (the `pr_backfill_done` flag prevents re-running).

- [ ] **Step 4: Commit**

```bash
git add js/app.js
git commit -m "feat: run PR backfill once during app init"
```

---

## Task 3: `js/today.js` — integrate live PR detection + toast

**Files:**
- Modify: `js/today.js`

**Interfaces:**
- Consumes: `scanForPRs`, `formatPRToast` from `js/pr-detect.js` (Task 1)

- [ ] **Step 1: Add the import**

Find the top of `js/today.js`:
```js
import { dbGet, dbPut, dbGetAll, dbGetByIndex, dbAdd, esc, todayStr } from './db.js';
import { renderJournalPrompt } from './journal.js';
import { listProgrammes, getProgrammeSession } from './programmes.js';
```
Replace with:
```js
import { dbGet, dbPut, dbGetAll, dbGetByIndex, dbAdd, esc, todayStr } from './db.js';
import { renderJournalPrompt } from './journal.js';
import { listProgrammes, getProgrammeSession } from './programmes.js';
import { scanForPRs, formatPRToast } from './pr-detect.js';
```
(If the exact existing import lines differ slightly from what's shown above, add the new `pr-detect.js` import line right after whichever line imports from `./programmes.js` — don't change anything else on those lines.)

- [ ] **Step 2: Call `scanForPRs` after saving, before the journal prompt**

Find (`js/today.js:767-786`):
```js
  container.querySelector('#save-today-log')?.addEventListener('click', async () => {
    collectBlockLog(container);
    const exercises = serializeBlockLog();
    const workoutData = { date: todayStr(), source: 'today-log', programme: await getCurrentProgramme(), week: await getCurrentWeek(), day: selectedDay, exercises };
    if (todayWorkoutId) {
      await dbPut('workouts', { id: todayWorkoutId, ...workoutData });
      showToast('Session updated!');
    } else {
      todayWorkoutId = await dbAdd('workouts', workoutData);
      showToast('Session saved!');
    }
    await loadTodayLog();
    const btn = container.querySelector('#save-today-log');
    if (btn) btn.textContent = '✓ Update Session';
    const headerRow = container.querySelector('.card-header-row');
    if (headerRow && !headerRow.querySelector('.badge.info')) {
      headerRow.insertAdjacentHTML('beforeend', '<span class="badge info" style="align-self:flex-start">✓ Saved</span>');
    }
    renderJournalPrompt(container, todayWorkoutId, todayStr());
  });
```
Replace with:
```js
  container.querySelector('#save-today-log')?.addEventListener('click', async () => {
    collectBlockLog(container);
    const exercises = serializeBlockLog();
    const workoutData = { date: todayStr(), source: 'today-log', programme: await getCurrentProgramme(), week: await getCurrentWeek(), day: selectedDay, exercises };
    if (todayWorkoutId) {
      await dbPut('workouts', { id: todayWorkoutId, ...workoutData });
      showToast('Session updated!');
    } else {
      todayWorkoutId = await dbAdd('workouts', workoutData);
      showToast('Session saved!');
    }
    const newPRs = await scanForPRs(workoutData.exercises, workoutData.date);
    const prToast = formatPRToast(newPRs);
    if (prToast) showToast(prToast);
    await loadTodayLog();
    const btn = container.querySelector('#save-today-log');
    if (btn) btn.textContent = '✓ Update Session';
    const headerRow = container.querySelector('.card-header-row');
    if (headerRow && !headerRow.querySelector('.badge.info')) {
      headerRow.insertAdjacentHTML('beforeend', '<span class="badge info" style="align-self:flex-start">✓ Saved</span>');
    }
    renderJournalPrompt(container, todayWorkoutId, todayStr());
  });
```
(This calls `showToast` a second time when there's a new PR — the existing "Session saved!"/"Session updated!" toast and the PR toast are two separate, sequential calls. Check `today.js`'s `showToast` implementation: if it's a single-slot toast element that replaces its own text/timer on each call, the PR toast will simply replace the save-confirmation toast a moment later, which is fine — the save already succeeded and is visually confirmed by the "✓ Saved" badge injected right after.)

- [ ] **Step 3: Syntax-check**

Run: `node --input-type=module < js/today.js`
Expected: only `ERR_MODULE_NOT_FOUND`, no `SyntaxError`.

- [ ] **Step 4: Manual verification**

Start `vercel dev`, open the app, go to Today. Log a weighted set below any existing PR for that exercise (or a brand-new exercise name never logged before), Save Session — confirm a "🏆 New PR: ..." toast appears and the PRs tab shows it. Log another set at or below that same value, save again — confirm no PR toast fires this time (just the normal save confirmation). Confirm the journal prompt still appears after saving either way (unaffected).

- [ ] **Step 5: Commit**

```bash
git add js/today.js
git commit -m "feat: today.js — auto-detect PRs from logged sets, toast on new record"
```

---

## Task 4: `js/workout.js` — integrate live PR detection + toast

**Files:**
- Modify: `js/workout.js`

**Interfaces:**
- Consumes: `scanForPRs`, `formatPRToast` from `js/pr-detect.js` (Task 1)

- [ ] **Step 1: Add the import**

Find the top of `js/workout.js`:
```js
import { ALL_EXERCISES, SKILL_PROGRESSIONS } from './profile.js';
import { dbAdd, dbPut, dbGetAll, dbDelete, esc, todayStr } from './db.js';
```
Replace with:
```js
import { ALL_EXERCISES, SKILL_PROGRESSIONS } from './profile.js';
import { dbAdd, dbPut, dbGetAll, dbDelete, esc, todayStr } from './db.js';
import { scanForPRs, formatPRToast } from './pr-detect.js';
```

- [ ] **Step 2: Capture the exercises/date before the post-save reset, and call `scanForPRs`**

Find (`js/workout.js:235-247`):
```js
  container.querySelector('#save-workout')?.addEventListener('click', async () => {
    if (currentSession.exercises.length === 0) { showToast('Add at least one exercise'); return; }
    if (editingWorkoutId) {
      await dbPut('workouts', { id: editingWorkoutId, ...currentSession });
      editingWorkoutId = null;
      showToast('Session updated!');
    } else {
      await dbAdd('workouts', { ...currentSession });
      showToast('Session saved!');
    }
    currentSession = { date: todayStr(), exercises: [] };
    renderWorkout(container);
  });
```
Replace with:
```js
  container.querySelector('#save-workout')?.addEventListener('click', async () => {
    if (currentSession.exercises.length === 0) { showToast('Add at least one exercise'); return; }
    const savedExercises = currentSession.exercises;
    const savedDate = currentSession.date;
    if (editingWorkoutId) {
      await dbPut('workouts', { id: editingWorkoutId, ...currentSession });
      editingWorkoutId = null;
      showToast('Session updated!');
    } else {
      await dbAdd('workouts', { ...currentSession });
      showToast('Session saved!');
    }
    const newPRs = await scanForPRs(savedExercises, savedDate);
    const prToast = formatPRToast(newPRs);
    if (prToast) showToast(prToast);
    currentSession = { date: todayStr(), exercises: [] };
    renderWorkout(container);
  });
```
(`savedExercises`/`savedDate` are captured before `currentSession` gets reset two lines later — without this, `scanForPRs` would see the just-reset empty session instead of what was actually saved.)

- [ ] **Step 3: Syntax-check**

Run: `node --input-type=module < js/workout.js`
Expected: only `ERR_MODULE_NOT_FOUND`, no `SyntaxError`.

- [ ] **Step 4: Manual verification**

Go to the Train tab, log an exercise with a weight above any existing PR (or a brand-new exercise), Save Session — confirm the "🏆 New PR: ..." toast appears and the PR shows up on the PRs tab. Log the same exercise again at a lower or equal weight, save — confirm no PR toast this time.

- [ ] **Step 5: Commit**

```bash
git add js/workout.js
git commit -m "feat: workout.js — auto-detect PRs from logged sets, toast on new record"
```

---

## Task 5: `sw.js` — register the new file, bump cache

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: Add `js/pr-detect.js` to `ASSETS`, bump `CACHE`**

Find:
```js
const CACHE = 'mystats-v46';
const ASSETS = ['/', '/index.html', '/style.css', '/manifest.json', '/js/db.js', '/js/profile.js', '/js/config.js', '/js/onboarding.js', '/js/today.js', '/js/workout.js', '/js/running.js', '/js/bodyscan.js', '/js/progress.js', '/js/reminders.js', '/js/settings.js', '/js/app.js', '/js/recovery.js', '/js/journal.js', '/js/prs.js', '/js/programmes.js', '/js/programme-editor.js', '/icon-192.png', '/icon-512.png', '/favicon.ico'];
```
Replace with:
```js
const CACHE = 'mystats-v47';
const ASSETS = ['/', '/index.html', '/style.css', '/manifest.json', '/js/db.js', '/js/profile.js', '/js/config.js', '/js/onboarding.js', '/js/today.js', '/js/workout.js', '/js/running.js', '/js/bodyscan.js', '/js/progress.js', '/js/reminders.js', '/js/settings.js', '/js/app.js', '/js/recovery.js', '/js/journal.js', '/js/prs.js', '/js/programmes.js', '/js/programme-editor.js', '/js/pr-detect.js', '/icon-192.png', '/icon-512.png', '/favicon.ico'];
```

- [ ] **Step 2: Syntax-check**

Run: `node -c sw.js`
Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add sw.js
git commit -m "chore: register pr-detect.js in the service worker cache"
```

---

## Task 6: Fix backfill flag surviving a backup import — `importBackup()` + `onboarding.js`

**Files:**
- Modify: `js/settings.js`
- Modify: `js/onboarding.js`

**Interfaces:**
- Consumes: `ensurePRBackfill` from `js/pr-detect.js` (Task 1)

**Why this task exists:** Task 2's manual verification surfaced a real bug: `ensurePRBackfill()`'s one-time guard (`pr_backfill_done` in the `settings` store) gets set to `true` the very first time `init()` runs — which, on a brand-new install, happens *before* onboarding's "Import Existing Backup" flow ever runs (that flow doesn't call `location.reload()`, so `init()` never runs a second time to re-check the flag). The result: a new user restoring from backup during onboarding gets a permanently empty PR board, even though their imported history has plenty of qualifying sets. The same root cause also affects re-importing a *different* backup later via Settings → Data & Export: `importBackup()` only upserts settings keys actually present in the backup file, so an already-`true` local flag survives that reload untouched too. Both call sites share one function, `importBackup()` (`js/settings.js:707`) — fixing the flag there covers both paths.

- [ ] **Step 1: Clear the backfill flag whenever a backup is imported**

Find, in `js/settings.js`, the `importBackup` function (starts at `js/settings.js:707`). Find its last line before the closing `}` — the exact tail of the function that finishes writing all the imported records (locate it by reading the function; it ends after the `autoStores` loop and any remaining store-restore logic). Add this as the very last statement in the function, before the closing brace:
```js
  // A freshly-imported backup should always get a fresh PR backfill scan against
  // its own workout history — clear the one-time guard so the next backfill call
  // (whether via a reload here, or an explicit call from onboarding.js) actually runs.
  await dbDelete('settings', 'pr_backfill_done');
```
(`dbDelete` is already imported at the top of `js/settings.js` — no new import needed.)

- [ ] **Step 2: Have onboarding explicitly re-run the backfill after import**

Find, in `js/onboarding.js`:
```js
import { dbPut } from './db.js';
import { importBackup } from './settings.js';
```
Replace with:
```js
import { dbPut } from './db.js';
import { importBackup } from './settings.js';
import { ensurePRBackfill } from './pr-detect.js';
```

Find:
```js
    try {
      await importBackup(file);
      status.textContent = '✓ Done! Loading your data…';
      status.style.color = 'var(--success)';
      setTimeout(() => { overlay.remove(); onComplete(); }, 1000);
    } catch (err) {
```
Replace with:
```js
    try {
      await importBackup(file);
      await ensurePRBackfill(); // flag was just cleared by importBackup — this actually scans now
      status.textContent = '✓ Done! Loading your data…';
      status.style.color = 'var(--success)';
      setTimeout(() => { overlay.remove(); onComplete(); }, 1000);
    } catch (err) {
```

- [ ] **Step 3: Syntax-check**

Run: `node --input-type=module < js/settings.js` and `node --input-type=module < js/onboarding.js`
Expected: only `ERR_MODULE_NOT_FOUND`, no `SyntaxError`.

- [ ] **Step 4: Manual verification — both call sites**

Using the same synthetic-workout-seeding approach as Task 2's verification (seed 2-3 `workouts` records directly into IndexedDB via `browser_evaluate` before the reload/import that should trigger backfill):

**Onboarding path:** Clear IndexedDB entirely. Reload — the first `init()` call now runs against a truly empty database, setting `pr_backfill_done = true` (correctly, since there's nothing to backfill yet). Before completing onboarding, seed synthetic `workouts` records directly into IndexedDB (bypassing the UI), matching the pattern used in Task 2. Then use onboarding's "📥 Import Existing Backup" button to import any valid backup JSON (it doesn't need to contain the seeded workouts — the seeded workouts are already in IndexedDB directly, separate from whatever the backup file itself contains; the point is proving the flag gets cleared and re-scanned after `importBackup()` runs, regardless of what's in the imported file). Confirm the PRs tab, once the main app loads, shows PRs derived from the seeded workouts — proving the flag-clear + explicit re-run actually worked.

**Settings re-import path:** From the main app (not onboarding), seed 1-2 more synthetic `workouts` with an even higher value for the same exercise. Go to Settings → Data & Export → import a backup file (any valid one) — confirm the page reloads, and the PRs tab reflects the new highest value from the more-recently-seeded data, proving the reload's `ensurePRBackfill()` call actually re-scanned rather than being blocked by an already-`true` flag.

Clean up seeded/test data afterward.

- [ ] **Step 5: Commit**

```bash
git add js/settings.js js/onboarding.js
git commit -m "fix: backup import clears PR backfill flag so imported history actually gets scanned"
```

---

## Task 7: Deploy and smoke-test

**Files:** none (verification only)

- [ ] **Step 1: Local full-flow smoke-test**

With `vercel dev --listen 3211` running:
1. Clear IndexedDB, import the `mystats-backup-2026-05-20.json` backup (or any backup with real history) via onboarding — confirm the PRs tab is populated purely from the backfill, with no session logged in this browser session. (If that specific backup file has no workout history, seed synthetic `workouts` records directly into IndexedDB first, as in Task 2/6's verification, then import — the point is confirming the onboarding-import path from Task 6 actually backfills.)
2. Today tab — log a new all-time-best weight on an existing exercise, Save Session — confirm the "🏆 New PR" toast and the updated PR card.
3. Same exercise, log a lower weight, save again — confirm no PR toast, normal save toast only.
4. Train tab — log a brand-new exercise name with a weight, save — confirm a PR toast fires (first-ever record for that name).
5. Manually add a PR via the existing "+ Add PR" form (unrelated exercise) — confirm the manual flow still works untouched.
6. Reload the app — confirm the backfill doesn't re-run or duplicate any PR (check the PRs tab count is unchanged after reload).
7. Settings → Data & Export → import a different backup — confirm this doesn't crash and the reload correctly re-scans (per Task 6's fix) rather than silently skipping.

- [ ] **Step 2: Deploy**

```bash
vercel --prod --yes
```

- [ ] **Step 3: Production spot-check**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://mystats-pwa-ochre.vercel.app/js/pr-detect.js
```
Expected: `200`.

- [ ] **Step 4: Push**

```bash
git push origin main
```
