# Four-Week Programme Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace single-week-plus-generic-scaling programme storage with four genuinely independent stored weeks per programme, migrating existing A/B data in place with zero change to what users currently see.

**Architecture:** `js/programmes.js` (data layer) changes its stored shape from `{0-6: dayObj}` to `{1: weekObj, 2: weekObj, 3: weekObj, 4: weekObj}` where each `weekObj` is `{0-6: dayObj, weekLabel?, weekHint?}`. A self-healing migration inside `getSessions()` detects old-shape data on read and upgrades it in place by replaying the exact scaling math the old `weekMods()`/`applyHoldBonus()` (moving from `js/today.js` into `js/programmes.js`) already compute today. `js/today.js` and `js/programme-editor.js` are updated to read/write week-scoped data through the new API.

**Tech Stack:** Vanilla JS ES modules, IndexedDB, no build step, no automated test framework (manual verification only, per project convention).

## Global Constraints

- Every programme (A, B, all custom) stores four genuinely independent weeks — no generic scaling except the one-time legacy migration replay.
- A/B's migrated output must be **byte-for-byte identical** to what today's `weekMods()`-based rendering currently produces — this is the critical no-regression requirement.
- `getSessions(id)` returns `emptyFourWeeks()` (never the old `emptyWeek()`) when the programme's settings key is entirely missing.
- Migration must be safe under concurrent/repeated calls (idempotent) and under backup re-import of old-shape data (no special-casing needed — same self-healing path).
- Global `WEEK_LABELS`/`WEEK_HINTS` fallback text is neutral ("Week 1", "Week 2", etc, no hint) — never A/B's specific "Foundation/Intensification/Volume/Deload" language, which A/B carry as their own explicit per-week `weekLabel`/`weekHint` instead.
- The manual block editor's day-save is week-scoped (`getWeekSessions`/`saveWeekSessions`); both upload handlers (JSON import, PDF/Word auto-parse) write/merge into the full 4-week object via `saveSessions` — these are NOT interchangeable, per the two upload handlers' existing merge-not-replace semantics (only days actually present in an upload are touched; everything else in the programme is left alone).
- Advanced JSON upload validation must accept *either* a `weeks` key or a `days` key present — not require `days` unconditionally (the current code does, which would silently reject a `weeks`-only file).
- No changes to `workouts` store, PR detection (`js/pr-detect.js`), or `getPrevExercise` in `js/today.js` — this only touches programme blueprint storage.
- Service worker cache (`sw.js`) must bump its `CACHE` version for the changes to reach users (all three touched JS files are already listed in `ASSETS`).
- No automated test framework exists in this project. Verification is: `node --input-type=module < file.js` syntax checks (a `SyntaxError` is a real failure; `ERR_MODULE_NOT_FOUND` is expected and fine), plus live browser verification via `vercel dev` + Playwright MCP tools, per established project convention.

---

## File Structure

- **Modify `js/programmes.js`** (data layer) — new 4-week storage shape, migration, robustness-verified seeding. No new files; this file already owns programme data and stays the single place that shape lives.
- **Modify `js/today.js`** — remove the now-dead `weekMods()`/`applyHoldBonus()`, thread `week` through to `getWeekSessions`, per-week label/hint fallback.
- **Modify `js/programme-editor.js`** — week selector UI, week-scoped manual save, upload handlers rebuilt for the `weeks`/`days` format, updated downloadable template.
- **Modify `sw.js`** — cache version bump only (no `ASSETS` changes needed; all three files are already listed).
- **`js/settings.js` is intentionally untouched.** Its `importBackup()` upserts whatever `settings` keys a backup file contains, which could reintroduce old-shape `programme_a_sessions`/`programme_b_sessions` data from a pre-this-change backup. No special-casing is needed there — the next `getSessions` read for that programme detects and re-migrates it via the same self-healing path described in Task 1, identical to any other old-shape data.

---

### Task 1: Rewrite `js/programmes.js` — four-week storage, migration, robustness

**Files:**
- Modify: `js/programmes.js` (full-file rewrite — every function changes or is new)

**Interfaces:**
- Consumes: `dbGet`, `dbPut`, `dbDelete` from `./db.js` (unchanged); `PROG_A_SESSIONS`, `PROG_B_SESSIONS` from `./profile.js` (unchanged, still the old single-week shape — used only as migration/seeding input).
- Produces (for Tasks 2 and 3):
  - `export const MAX_PROGRAMMES` — unchanged.
  - `export const BLOCK_TYPES` — unchanged.
  - `export const WEEK_LABELS`, `export const WEEK_HINTS` — new, neutral fallback arrays (`['', 'Week 1', 'Week 2', 'Week 3', 'Week 4']` / all-empty-string hints), indexed 1-4.
  - `export async function ensureSeeded()` — same signature/behavior (fresh installs get A/B seeded), now writes the new 4-week shape.
  - `export async function listProgrammes()` — unchanged.
  - `export async function getProgrammeMeta(id)` — unchanged.
  - `export async function createProgramme(name)` — same signature, now seeds 4 empty weeks instead of 1.
  - `export async function renameProgramme(id, name)` — unchanged.
  - `export async function deleteProgramme(id)` — unchanged.
  - `export async function getSessions(id)` — same name, **return shape changes**: now the full `{1:weekObj,2:weekObj,3:weekObj,4:weekObj}` (was one week's `{0-6:dayObj}`). Self-migrates old-shape data in place.
  - `export async function getWeekSessions(id, week)` — new: `{0-6:dayObj, weekLabel?, weekHint?}` for one week.
  - `export async function saveWeekSessions(id, week, daySessions)` — new: writes one week's data.
  - `export async function saveSessions(id, sessions)` — same name/code, **callers now always pass the full 4-week object**, not one week.
- **Deviation from spec's literal API list:** the spec describes `getProgrammeSession(id, week, day)` gaining a `week` parameter. This plan drops it entirely instead. Its only caller was `today.js`'s `renderToday`, which (Task 2) needs both the day's blocks *and* the week's `weekLabel`/`weekHint` from the same fetch — calling `getProgrammeSession` for the day and separately fetching the week object for its label would duplicate the same underlying `getSessions()` read for no benefit. `renderToday` calls `getWeekSessions` directly and indexes into it for both needs. With no remaining caller, keeping `getProgrammeSession` as an unused export violates this project's established YAGNI convention (the exact same convention this task applies by deleting `weekMods()`/`applyHoldBonus()` in Task 2 rather than leaving them unused). If a future feature needs a single-day-only accessor, it can be added then.

- [ ] **Step 1: Replace the entire contents of `js/programmes.js`**

```js
import { dbGet, dbPut, dbDelete } from './db.js';
import { PROG_A_SESSIONS, PROG_B_SESSIONS } from './profile.js';

export const MAX_PROGRAMMES = 10;
const ALL_IDS = 'ABCDEFGHIJ'.split('');

export const BLOCK_TYPES = [
  { type: 'warmup',   label: 'Warm-Up',  kind: 'items' },
  { type: 'core',     label: 'Core',     kind: 'items' },
  { type: 'skill',    label: 'Skill',    kind: 'skill' },
  { type: 'strength', label: 'Strength', kind: 'strength' },
  { type: 'circuit',  label: 'Circuit',  kind: 'circuit' },
  { type: 'cardio',   label: 'Cardio',   kind: 'cardio' },
  { type: 'mobility', label: 'Mobility', kind: 'mobility' },
];

// Fallback week labels/hints — only ever shown for a week that doesn't define its own
// weekLabel/weekHint (i.e. a brand-new, not-yet-filled-in custom programme). A/B always
// carry their own explicit labels (set below during seeding/migration), so this never
// fires for them.
export const WEEK_LABELS = ['', 'Week 1', 'Week 2', 'Week 3', 'Week 4'];
export const WEEK_HINTS  = ['', '', '', '', ''];

function emptyWeek() {
  const week = {};
  for (let d = 0; d <= 6; d++) week[d] = { label: 'Rest', focus: 'Recovery', blocks: [] };
  return week;
}

function emptyFourWeeks() {
  return { 1: emptyWeek(), 2: emptyWeek(), 3: emptyWeek(), 4: emptyWeek() };
}

// ── Legacy week-scaling — used ONLY to materialize A/B's historical weeks 2-4 during
// seeding/migration below. This is exactly what today.js's weekMods()/applyHoldBonus()
// used to compute at render time before this change; replaying it once at migration
// time makes the migrated output byte-for-byte identical to what users saw before.
// New programmes never go through this — every week they define is stored as real data.
const LEGACY_WEEK_LABELS = ['', 'Foundation', 'Intensification', 'Volume', 'Deload'];
const LEGACY_WEEK_HINTS  = ['', 'Base sets and reps as written', 'Heavier loads, lower reps, advance skill level or +2s to holds', 'Add 1 extra set to all skill work, moderate weight', 'Reduce all loads 40-50% — quality skill focus only'];

function legacyWeekMods(week) {
  switch (week) {
    case 2: return { extraSets: 0, holdBonus: 2, blockNote: 'Heavy — lower reps, advance skill' };
    case 3: return { extraSets: 1, holdBonus: 0, blockNote: '+1 set — moderate weight' };
    case 4: return { extraSets: 0, holdBonus: 0, blockNote: 'Deload — 40-50% load' };
    default: return { extraSets: 0, holdBonus: 0, blockNote: null };
  }
}

function applyHoldBonus(target, bonus) {
  if (!bonus) return target;
  const m = target.match(/^(\d+)(s.*)$/);
  return m ? `${parseInt(m[1]) + bonus}${m[2]}` : target;
}

function materializeLegacyWeek(week1Days, week) {
  const mods = legacyWeekMods(week);
  const days = {};
  for (let d = 0; d <= 6; d++) {
    const day = week1Days[d] ?? { label: 'Rest', focus: 'Recovery', blocks: [] };
    days[d] = {
      label: day.label,
      focus: day.focus,
      blocks: (day.blocks || []).map(block => {
        if (block.type === 'skill') {
          return {
            ...block,
            note: mods.blockNote || block.note,
            exercises: (block.exercises || []).map(ex => ({
              ...ex,
              sets: ex.sets + mods.extraSets,
              target: applyHoldBonus(ex.target, mods.holdBonus),
            })),
          };
        }
        if (block.type === 'strength') {
          return {
            ...block,
            note: mods.blockNote || block.note,
            exercises: (block.exercises || []).map(ex => ({
              ...ex,
              sets: (ex.sets || 3) + mods.extraSets,
            })),
          };
        }
        return { ...block }; // warmup/core/circuit/cardio/mobility — weekMods() never touched these
      }),
    };
  }
  return { ...days, weekLabel: LEGACY_WEEK_LABELS[week] || '', weekHint: LEGACY_WEEK_HINTS[week] || '' };
}

function migrateToFourWeeks(week1Days) {
  return {
    1: { ...week1Days, weekLabel: LEGACY_WEEK_LABELS[1] || '', weekHint: LEGACY_WEEK_HINTS[1] || '' },
    2: materializeLegacyWeek(week1Days, 2),
    3: materializeLegacyWeek(week1Days, 3),
    4: materializeLegacyWeek(week1Days, 4),
  };
}

// Writes `data` to `store`, reads it back to confirm the write actually persisted, and
// retries once before throwing. Used only for the one-time seeding writes in
// ensureSeeded() — if this throws, it surfaces via app.js's existing try/catch
// "Failed to start" error card instead of silently leaving the app partially seeded.
async function verifiedPut(store, data) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await dbPut(store, data);
    const readBack = await dbGet(store, data.key);
    if (readBack !== undefined && JSON.stringify(readBack.value) === JSON.stringify(data.value)) return;
  }
  throw new Error(`Failed to persist settings key "${data.key}" — write did not verify after retry`);
}

export async function ensureSeeded() {
  const list = await dbGet('settings', 'programmes_list');
  if (list) return list.value;
  const seeded = [
    { id: 'A', name: 'Programme A — Calisthenics',  source: 'builtin', description: '', updatedAt: new Date().toISOString() },
    { id: 'B', name: 'Programme B — Power & Strength', source: 'builtin', description: '', updatedAt: new Date().toISOString() },
  ];
  await verifiedPut('settings', { key: 'programmes_list', value: seeded });
  await verifiedPut('settings', { key: 'programme_a_sessions', value: migrateToFourWeeks(PROG_A_SESSIONS) });
  await verifiedPut('settings', { key: 'programme_b_sessions', value: migrateToFourWeeks(PROG_B_SESSIONS) });
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
  await dbPut('settings', { key: `programme_${id.toLowerCase()}_sessions`, value: emptyFourWeeks() });
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
  const key = `programme_${id.toLowerCase()}_sessions`;
  const s = await dbGet('settings', key);
  if (!s || !s.value) return emptyFourWeeks();
  const value = s.value;
  // Old shape always has a top-level day-of-week key at 0 (Sunday) — one flat week.
  // New shape is keyed by week number (1-4) and never has a top-level 0. Migration is a
  // pure function of `value`, so this is safe if called concurrently from more than one
  // place (e.g. Today and Settings both loading near startup) or after a backup restore
  // reintroduces old-shape data — every caller just re-migrates and re-writes the same
  // result; redundant, never torn or incorrect.
  if (value[0] !== undefined) {
    const migrated = migrateToFourWeeks(value);
    await dbPut('settings', { key, value: migrated });
    return migrated;
  }
  return value;
}

export async function saveSessions(id, sessions) {
  await dbPut('settings', { key: `programme_${id.toLowerCase()}_sessions`, value: sessions });
  const list = await listProgrammes();
  const updated = list.map(p => p.id === id ? { ...p, updatedAt: new Date().toISOString() } : p);
  await dbPut('settings', { key: 'programmes_list', value: updated });
}

export async function getWeekSessions(id, week) {
  const sessions = await getSessions(id);
  return sessions[week] ?? emptyWeek();
}

export async function saveWeekSessions(id, week, daySessions) {
  const sessions = await getSessions(id);
  sessions[week] = daySessions;
  await saveSessions(id, sessions);
}
```

- [ ] **Step 2: Syntax-check the file**

Run: `cd /home/z/Projects/mystats-pwa && node --input-type=module < js/programmes.js`
Expected: an `ERR_MODULE_NOT_FOUND` (or similar module-resolution) error for `./db.js`/`./profile.js` — this is expected since the file is piped in isolation, not run as part of the app. A `SyntaxError` is the only real failure here.

- [ ] **Step 3: Verify the migration logic in isolation with a throwaway Node script**

This checks `migrateToFourWeeks`/`materializeLegacyWeek` produce sane output without needing a browser. Create a temporary script (not committed):

```bash
cd /home/z/Projects/mystats-pwa && cat > /tmp/verify-migration.mjs << 'EOF'
// Copy the pure functions (no DB) directly for a quick logic check.
const LEGACY_WEEK_LABELS = ['', 'Foundation', 'Intensification', 'Volume', 'Deload'];
const LEGACY_WEEK_HINTS  = ['', 'Base sets and reps as written', 'Heavier loads, lower reps, advance skill level or +2s to holds', 'Add 1 extra set to all skill work, moderate weight', 'Reduce all loads 40-50% — quality skill focus only'];
function legacyWeekMods(week) {
  switch (week) {
    case 2: return { extraSets: 0, holdBonus: 2, blockNote: 'Heavy — lower reps, advance skill' };
    case 3: return { extraSets: 1, holdBonus: 0, blockNote: '+1 set — moderate weight' };
    case 4: return { extraSets: 0, holdBonus: 0, blockNote: 'Deload — 40-50% load' };
    default: return { extraSets: 0, holdBonus: 0, blockNote: null };
  }
}
function applyHoldBonus(target, bonus) {
  if (!bonus) return target;
  const m = target.match(/^(\d+)(s.*)$/);
  return m ? `${parseInt(m[1]) + bonus}${m[2]}` : target;
}
function materializeLegacyWeek(week1Days, week) {
  const mods = legacyWeekMods(week);
  const days = {};
  for (let d = 0; d <= 6; d++) {
    const day = week1Days[d] ?? { label: 'Rest', focus: 'Recovery', blocks: [] };
    days[d] = {
      label: day.label, focus: day.focus,
      blocks: (day.blocks || []).map(block => {
        if (block.type === 'skill') return { ...block, note: mods.blockNote || block.note, exercises: (block.exercises || []).map(ex => ({ ...ex, sets: ex.sets + mods.extraSets, target: applyHoldBonus(ex.target, mods.holdBonus) })) };
        if (block.type === 'strength') return { ...block, note: mods.blockNote || block.note, exercises: (block.exercises || []).map(ex => ({ ...ex, sets: (ex.sets || 3) + mods.extraSets })) };
        return { ...block };
      }),
    };
  }
  return { ...days, weekLabel: LEGACY_WEEK_LABELS[week] || '', weekHint: LEGACY_WEEK_HINTS[week] || '' };
}

const week1 = {
  0: { label: 'Rest', focus: 'Recovery', blocks: [] },
  1: { label: 'Push', focus: 'Upper', blocks: [
    { type: 'skill', name: 'Ring Dip', note: '', exercises: [{ name: 'Ring support hold', sets: 5, target: '20s' }] },
    { type: 'strength', label: 'Strength', exercises: [{ name: 'Bench Press', sets: 4, reps: '6-8' }] },
    { type: 'warmup', items: ['Jog 5 min'] },
  ] },
};

const w2 = materializeLegacyWeek(week1, 2);
const w3 = materializeLegacyWeek(week1, 3);
const w4 = materializeLegacyWeek(week1, 4);

console.log('W2 skill sets (expect 5, unchanged extraSets=0):', w2[1].blocks[0].exercises[0].sets);
console.log('W2 skill target (expect 22s, +2 hold bonus):', w2[1].blocks[0].exercises[0].target);
console.log('W2 strength sets (expect 4, unchanged extraSets=0):', w2[1].blocks[1].exercises[0].sets);
console.log('W3 skill sets (expect 6, +1 extraSets):', w3[1].blocks[0].exercises[0].sets);
console.log('W3 strength sets (expect 5, +1 extraSets):', w3[1].blocks[1].exercises[0].sets);
console.log('W4 blockNote (expect Deload text):', w4[1].blocks[0].note);
console.log('W2 warmup unchanged (expect ["Jog 5 min"]):', w2[1].blocks[2].items);
console.log('W2 weekLabel (expect Intensification):', w2.weekLabel);
EOF
node /tmp/verify-migration.mjs
rm /tmp/verify-migration.mjs
```

Expected output:
```
W2 skill sets (expect 5, unchanged extraSets=0): 5
W2 skill target (expect 22s, +2 hold bonus): 22s
W2 strength sets (expect 4, unchanged extraSets=0): 4
W3 skill sets (expect 6, +1 extraSets): 6
W3 strength sets (expect 5, +1 extraSets): 5
W4 blockNote (expect Deload text): Deload — 40-50% load
W2 warmup unchanged (expect ["Jog 5 min"]): [ 'Jog 5 min' ]
W2 weekLabel (expect Intensification): Intensification
```
If any value differs, the migration math has a bug — fix `materializeLegacyWeek` before proceeding, since this is the exact logic that must reproduce today's live rendering byte-for-byte.

- [ ] **Step 4: Commit**

```bash
cd /home/z/Projects/mystats-pwa
git add js/programmes.js
git commit -m "feat: four-week programme storage with self-healing migration

Every programme now stores four genuinely independent weeks instead of
one week plus a generic scaling modifier. getSessions() detects the old
single-week shape on read and migrates it in place by replaying the
exact math the old weekMods()/applyHoldBonus() (moving here from
today.js in the next commit) used to compute at render time — so
existing A/B data renders identically to before, just from real stored
data instead of computed-on-the-fly scaling."
```

---

### Task 2: Update `js/today.js` — remove dead scaling code, thread week param, per-week labels

**Files:**
- Modify: `js/today.js:1-42` (imports, constants, `weekMods`/`applyHoldBonus` removal)
- Modify: `js/today.js:194-293` (`renderSkillBlock`, `renderStrengthBlock`)
- Modify: `js/today.js:413-444` (`renderSessionPanel`)
- Modify: `js/today.js:496-562` (`renderToday`)

**Interfaces:**
- Consumes from Task 1: `listProgrammes`, `getWeekSessions(id, week)`, `WEEK_LABELS`, `WEEK_HINTS` (all exported from `./programmes.js`).
- Produces: no new exports — `renderToday` is already the sole export used by `app.js`, unchanged signature.

- [ ] **Step 1: Update the import line and remove the local week-label constants + dead functions**

Current (`js/today.js:1-42`):
```js
import { PRE_TRAINING, MOBILITY_SESSIONS } from './profile.js';
import { dbGet, dbPut, dbGetAll, dbGetByIndex, dbAdd, esc, todayStr } from './db.js';
import { renderJournalPrompt } from './journal.js';
import { getChecklistItems, getSupplements } from './config.js';
import { listProgrammes, getProgrammeSession } from './programmes.js';
import { scanForPRs, formatPRToast } from './pr-detect.js';

// ── Module state ───────────────────────────────────────────────────────────
let blockLog = {};       // {exerciseName: {sets:[{weight,reps,note}], hold, level}, _warmup:bool, '_core:...':bool, _run:{...}, '_circuit:N':bool}
let currentBlocks = [];  // active session blocks
let selectedDay = new Date().getDay();
let todayWorkoutId = null;
let cachedAllWorkouts = [];
let activeProg = 'A';
let activeWeek = 1;

// Pending control state — committed on Apply
let pendingProg = null;   // null = use saved value
let pendingWeek = null;
let pendingDay  = null;

let todaySubTab = 'session'; // 'session' | 'checklist' | 'supps'

const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const WEEK_LABELS = ['','Foundation','Intensification','Volume','Deload'];
const WEEK_HINTS  = ['','Base sets and reps as written','Heavier loads, lower reps, advance skill level or +2s to holds','Add 1 extra set to all skill work, moderate weight','Reduce all loads 40-50% — quality skill focus only'];

// Returns per-week adjustments applied to displayed exercise targets
function weekMods() {
  switch (activeWeek) {
    case 2: return { extraSets: 0, holdBonus: 2, blockNote: 'Heavy — lower reps, advance skill' };
    case 3: return { extraSets: 1, holdBonus: 0, blockNote: '+1 set — moderate weight' };
    case 4: return { extraSets: 0, holdBonus: 0, blockNote: 'Deload — 40-50% load' };
    default: return { extraSets: 0, holdBonus: 0, blockNote: null };
  }
}

function applyHoldBonus(target, bonus) {
  if (!bonus) return target;
  const m = target.match(/^(\d+)(s.*)$/);
  return m ? `${parseInt(m[1]) + bonus}${m[2]}` : target;
}
```

Replace with:
```js
import { PRE_TRAINING, MOBILITY_SESSIONS } from './profile.js';
import { dbGet, dbPut, dbGetAll, dbGetByIndex, dbAdd, esc, todayStr } from './db.js';
import { renderJournalPrompt } from './journal.js';
import { getChecklistItems, getSupplements } from './config.js';
import { listProgrammes, getWeekSessions, WEEK_LABELS, WEEK_HINTS } from './programmes.js';
import { scanForPRs, formatPRToast } from './pr-detect.js';

// ── Module state ───────────────────────────────────────────────────────────
let blockLog = {};       // {exerciseName: {sets:[{weight,reps,note}], hold, level}, _warmup:bool, '_core:...':bool, _run:{...}, '_circuit:N':bool}
let currentBlocks = [];  // active session blocks
let selectedDay = new Date().getDay();
let todayWorkoutId = null;
let cachedAllWorkouts = [];
let activeProg = 'A';
let activeWeek = 1;

// Pending control state — committed on Apply
let pendingProg = null;   // null = use saved value
let pendingWeek = null;
let pendingDay  = null;

let todaySubTab = 'session'; // 'session' | 'checklist' | 'supps'

const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
```

This deletes `weekMods()` and `applyHoldBonus()` entirely (blocks now carry their own week-specific `sets`/`target`/`reps`/`note` directly from storage — no runtime scaling needed) and removes the local `WEEK_LABELS`/`WEEK_HINTS` (now imported from `./programmes.js` as the neutral fallback — A/B's actual "Foundation" etc. text comes from each week's own `weekLabel`/`weekHint`, threaded through in Step 3 below).

- [ ] **Step 2: Update `renderSkillBlock` and `renderStrengthBlock` to read stored values directly**

Current `renderSkillBlock` (`js/today.js:194-243`):
```js
function renderSkillBlock(block) {
  const exercises = block.exercises || [];
  const skillMods = weekMods();
  return `
    <div class="session-block skill-block">
      <div class="block-header-row">
        <span class="block-type-tag type-skill">Skill — ${esc(block.name)}</span>
        ${skillMods.blockNote ? `<span class="block-note">${esc(skillMods.blockNote)}</span>` : block.note ? `<span class="block-note">${esc(block.note)}</span>` : ''}
      </div>
      ${exercises.map(ex => {
        const log = blockLog[ex.name] || {};
        const setsCount = log.sets?.length || 0;
        const mods = skillMods;
        const adjSets = ex.sets + mods.extraSets;
        const adjTarget = applyHoldBonus(ex.target, mods.holdBonus);
        return `
          <div class="skill-exercise" data-ex="${esc(ex.name)}">
            <div class="skill-ex-header">
              <span class="skill-ex-name">${esc(ex.name)}</span>
              <span class="skill-ex-target">${esc(String(adjSets))} × ${esc(adjTarget)}${ex.note ? ` <span class="type-note">· ${esc(ex.note)}</span>` : ''}</span>
            </div>
            <div class="skill-ex-inputs">
              ${(() => {
                const p = getPrevExercise(ex.name);
                return `
              <div class="skill-field">
                <label class="skill-lbl">Sets done</label>
                <div class="set-counter">
                  <button class="sc-btn sc-minus" data-ex="${esc(ex.name)}">−</button>
                  <span class="sc-val" data-ex="${esc(ex.name)}">${setsCount}</span>
                  <span class="sc-of">/ ${adjSets}</span>
                  <button class="sc-btn sc-plus" data-ex="${esc(ex.name)}" data-target="${adjSets}">+</button>
                </div>
              </div>
              <div class="skill-field">
                <label class="skill-lbl">Best ${adjTarget.includes('s') && !adjTarget.includes('rep') ? 'hold' : 'result'}</label>
                <input type="text" class="skill-hold-in input-field" placeholder="${esc(adjTarget)}" value="${esc(log.hold || '')}" data-ex="${esc(ex.name)}">
              </div>
              <div class="skill-prev-bar">
                <span class="skill-prev-lbl">prev</span>
                <input type="text" class="str-prev-ref" placeholder="sets" value="${esc(p ? String(p.setsCount) : '')}" tabindex="-1" autocomplete="off">
                <span class="skill-prev-sep">sets</span>
                <input type="text" class="str-prev-ref" placeholder="hold" value="${esc(p?.hold || '')}" tabindex="-1" autocomplete="off">
              </div>`;
              })()}
            </div>
          </div>`;
      }).join('')}
    </div>`;
}
```

Replace with:
```js
function renderSkillBlock(block) {
  const exercises = block.exercises || [];
  return `
    <div class="session-block skill-block">
      <div class="block-header-row">
        <span class="block-type-tag type-skill">Skill — ${esc(block.name)}</span>
        ${block.note ? `<span class="block-note">${esc(block.note)}</span>` : ''}
      </div>
      ${exercises.map(ex => {
        const log = blockLog[ex.name] || {};
        const setsCount = log.sets?.length || 0;
        return `
          <div class="skill-exercise" data-ex="${esc(ex.name)}">
            <div class="skill-ex-header">
              <span class="skill-ex-name">${esc(ex.name)}</span>
              <span class="skill-ex-target">${esc(String(ex.sets))} × ${esc(ex.target)}${ex.note ? ` <span class="type-note">· ${esc(ex.note)}</span>` : ''}</span>
            </div>
            <div class="skill-ex-inputs">
              ${(() => {
                const p = getPrevExercise(ex.name);
                return `
              <div class="skill-field">
                <label class="skill-lbl">Sets done</label>
                <div class="set-counter">
                  <button class="sc-btn sc-minus" data-ex="${esc(ex.name)}">−</button>
                  <span class="sc-val" data-ex="${esc(ex.name)}">${setsCount}</span>
                  <span class="sc-of">/ ${ex.sets}</span>
                  <button class="sc-btn sc-plus" data-ex="${esc(ex.name)}" data-target="${ex.sets}">+</button>
                </div>
              </div>
              <div class="skill-field">
                <label class="skill-lbl">Best ${ex.target.includes('s') && !ex.target.includes('rep') ? 'hold' : 'result'}</label>
                <input type="text" class="skill-hold-in input-field" placeholder="${esc(ex.target)}" value="${esc(log.hold || '')}" data-ex="${esc(ex.name)}">
              </div>
              <div class="skill-prev-bar">
                <span class="skill-prev-lbl">prev</span>
                <input type="text" class="str-prev-ref" placeholder="sets" value="${esc(p ? String(p.setsCount) : '')}" tabindex="-1" autocomplete="off">
                <span class="skill-prev-sep">sets</span>
                <input type="text" class="str-prev-ref" placeholder="hold" value="${esc(p?.hold || '')}" tabindex="-1" autocomplete="off">
              </div>`;
              })()}
            </div>
          </div>`;
      }).join('')}
    </div>`;
}
```

Current `renderStrengthBlock` (`js/today.js:245-293`):
```js
function renderStrengthBlock(block) {
  const label = block.label || 'Strength';
  return `
    <div class="session-block strength-block">
      <div class="block-type-tag type-strength">${esc(label)}</div>
      ${(block.exercises || []).map(ex => {
        const log       = blockLog[ex.name] || {};
        const existing  = log.sets || [];
        const mods      = weekMods();
        const adjSets   = (ex.sets || 3) + mods.extraSets;
        const targetN   = adjSets;
        const rows      = [];
        for (let i = 0; i < Math.max(targetN, existing.length); i++) {
          const s = existing[i] || {};
          rows.push({ weight: s.weight ?? '', reps: s.reps ?? '', done: !!(s.weight || s.reps) });
        }
        const prev = getPrevExercise(ex.name);
        return `
          <div class="str-exercise" data-ex="${esc(ex.name)}">
            <div class="str-ex-header">
              <span class="str-ex-name">${esc(ex.name)}</span>
              <span class="str-ex-target">${adjSets} × ${esc(ex.reps)}${mods.blockNote ? ` <span class="type-note">(${esc(mods.blockNote)})</span>` : ''}</span>
            </div>
```

Replace those first 15 lines with:
```js
function renderStrengthBlock(block) {
  const label = block.label || 'Strength';
  return `
    <div class="session-block strength-block">
      <div class="block-header-row">
        <span class="block-type-tag type-strength">${esc(label)}</span>
        ${block.note ? `<span class="block-note">${esc(block.note)}</span>` : ''}
      </div>
      ${(block.exercises || []).map(ex => {
        const log       = blockLog[ex.name] || {};
        const existing  = log.sets || [];
        const targetN   = ex.sets || 3;
        const rows      = [];
        for (let i = 0; i < Math.max(targetN, existing.length); i++) {
          const s = existing[i] || {};
          rows.push({ weight: s.weight ?? '', reps: s.reps ?? '', done: !!(s.weight || s.reps) });
        }
        const prev = getPrevExercise(ex.name);
        return `
          <div class="str-exercise" data-ex="${esc(ex.name)}">
            <div class="str-ex-header">
              <span class="str-ex-name">${esc(ex.name)}</span>
              <span class="str-ex-target">${targetN} × ${esc(ex.reps)}</span>
            </div>
```

The rest of `renderStrengthBlock` (lines with `ex.note`, `str-tiles`, `str-add-set` button, closing `}).join('')` and `</div>\`;`) is unchanged — leave it exactly as-is.

- [ ] **Step 3: Thread week-specific labels through `renderSessionPanel` and update `renderToday`'s data fetch**

Current `renderSessionPanel` signature and its two-line label lookup (`js/today.js:413-415`):
```js
function renderSessionPanel(session, isRest, progress, mobility, week) {
  const weekName = WEEK_LABELS[week] || '';
  const weekHint = WEEK_HINTS[week] || '';
```

Replace with:
```js
function renderSessionPanel(session, isRest, progress, mobility, week, weekLabel, weekHint) {
  const weekName = weekLabel || WEEK_LABELS[week] || '';
  const weekHintText = weekHint || WEEK_HINTS[week] || '';
```

The rest of the function is unchanged **except** the one place `weekHint` was interpolated must now read `weekHintText` (the parameter name `weekHint` is now the function's own incoming argument, shadowing what was previously a local variable of the same name):

Current line inside the same function:
```js
          ${weekName ? `<div class="session-week-hint"><span class="week-phase-badge">W${week} ${esc(weekName)}</span> <span class="week-hint-text">${esc(weekHint)}</span></div>` : ''}
```

Replace with:
```js
          ${weekName ? `<div class="session-week-hint"><span class="week-phase-badge">W${week} ${esc(weekName)}</span> <span class="week-hint-text">${esc(weekHintText)}</span></div>` : ''}
```

Now update `renderToday` (`js/today.js:496-562`). Current data-fetch and session lines:
```js
export async function renderToday(container) {
  if (Object.keys(blockLog).length === 0) await loadTodayLog();

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
  currentBlocks  = session.blocks || [];
```

Replace with:
```js
export async function renderToday(container) {
  if (Object.keys(blockLog).length === 0) await loadTodayLog();

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

  // Fetched once (not via getProgrammeSession) since we need both this day's blocks
  // AND the week's own weekLabel/weekHint from the same object — two separate reads
  // would duplicate the same underlying getSessions() call for no benefit.
  const weekSessions = await getWeekSessions(prog, week);
  const session  = weekSessions[selectedDay] ?? { label: 'Rest', focus: 'Recovery', blocks: [] };
  currentBlocks  = session.blocks || [];
```

Finally, update the `renderSessionPanel` call site later in the same function. Current:
```js
    <div id="today-panel-session"   class="${todaySubTab !== 'session'   ? 'hidden' : ''}">
      ${renderSessionPanel(session, isRest, progress, mobility, week)}
    </div>
```

Replace with:
```js
    <div id="today-panel-session"   class="${todaySubTab !== 'session'   ? 'hidden' : ''}">
      ${renderSessionPanel(session, isRest, progress, mobility, week, weekSessions.weekLabel, weekSessions.weekHint)}
    </div>
```

- [ ] **Step 4: Syntax-check**

Run: `cd /home/z/Projects/mystats-pwa && node --input-type=module < js/today.js`
Expected: module-resolution error only (e.g. `ERR_MODULE_NOT_FOUND` for `./profile.js`), no `SyntaxError`.

- [ ] **Step 5: Grep-verify no dangling references to the removed functions/constants**

Run: `cd /home/z/Projects/mystats-pwa && grep -n "weekMods\|applyHoldBonus\|adjSets\|adjTarget" js/today.js`
Expected: no output (empty). If anything matches, a call site was missed in Steps 1-3 — find and fix it before continuing.

- [ ] **Step 6: Commit**

```bash
cd /home/z/Projects/mystats-pwa
git add js/today.js
git commit -m "refactor: today.js reads week-specific blocks directly, no runtime scaling

weekMods()/applyHoldBonus() are deleted — every week's sets/target/reps/
note now come straight from storage (programmes.js materializes them
once, at migration time, instead of every render). renderSessionPanel
now prefers a week's own weekLabel/weekHint over the neutral global
fallback, so custom programmes can show their own week names instead of
A/B's Foundation/Intensification/Volume/Deload language."
```

---

### Task 3: Update `js/programme-editor.js` — week selector, week-scoped save, upload format

**Files:**
- Modify: `js/programme-editor.js` (imports, module state, `renderBlockEditor`, `setupBlockEditorEvents`, `importJsonProgramme`, PDF/Word upload handler, `renderUploadSection`, download-template handler)

**Interfaces:**
- Consumes from Task 1: `getWeekSessions(id, week)`, `saveWeekSessions(id, week, daySessions)`, `getSessions(id)` (still needed — see Step 4/5), `saveSessions(id, sessions)` (unchanged), plus the already-consumed `listProgrammes`, `createProgramme`, `renameProgramme`, `deleteProgramme`, `BLOCK_TYPES`, `MAX_PROGRAMMES`.
- Produces: no new exports — `renderProgrammeManager`/`renderBlockEditor` remain the two exports `js/settings.js` calls, unchanged signatures.

- [ ] **Step 1: Update the import line and add `editorWeek` module state**

Current (`js/programme-editor.js:1-20`):
```js
import { esc } from './db.js';
import { listProgrammes, createProgramme, renameProgramme, deleteProgramme, getSessions, saveSessions, BLOCK_TYPES, MAX_PROGRAMMES } from './programmes.js';

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
let editorDay = 1; // 1=Mon .. 6=Sat, 0=Sun — matches the rest of the app's day numbering
let editingBlocks = []; // working copy of the open day's blocks array
const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
```

Replace with:
```js
import { esc } from './db.js';
import { listProgrammes, createProgramme, renameProgramme, deleteProgramme, getSessions, saveSessions, getWeekSessions, saveWeekSessions, BLOCK_TYPES, MAX_PROGRAMMES } from './programmes.js';

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
let editorWeek = 1; // 1-4 — which stored week the block builder is currently viewing/editing
let editorDay = 1; // 1=Mon .. 6=Sat, 0=Sun — matches the rest of the app's day numbering
let editingBlocks = []; // working copy of the open day's blocks array
const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
```

- [ ] **Step 2: Update `renderBlockEditor` to fetch/display week-scoped data with a week tab row**

Current (`js/programme-editor.js:119-154`):
```js
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
    <hr style="border-color:var(--border);margin:1rem 0">
    ${renderUploadSection(progId)}
  `;
  setupBlockEditorEvents(container, progId);
  setupUploadEvents(container, progId, () => renderBlockEditor(container, progId));
}
```

Replace with:
```js
export async function renderBlockEditor(container, progId) {
  const mount = container.querySelector('#block-editor-mount');
  if (!mount) return;
  const weekSessions = await getWeekSessions(progId, editorWeek);
  const day = weekSessions[editorDay] ?? { label: 'Rest', focus: 'Recovery', blocks: [] };
  editingBlocks = day.blocks.map(b => JSON.parse(JSON.stringify(b)));

  mount.innerHTML = `
    <div class="block-day-tabs">
      ${[1,2,3,4].map(w => `
        <button class="ctrl-pill week-pill ${editorWeek === w ? 'active' : ''}" data-edweek="${w}">W${w}</button>
      `).join('')}
    </div>
    <div class="form-grid" style="margin-bottom:.5rem">
      <div class="form-group"><label>Week Label</label>
        <input type="text" id="ed-week-label" class="input-field" value="${(weekSessions.weekLabel || '').replace(/"/g, '&quot;')}" placeholder="e.g. Skill Acquisition + Strength Foundation"></div>
      <div class="form-group"><label>Week Hint</label>
        <input type="text" id="ed-week-hint" class="input-field" value="${(weekSessions.weekHint || '').replace(/"/g, '&quot;')}" placeholder="e.g. Base sets and reps as written"></div>
    </div>
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
    <p class="muted" style="font-size:.75rem;margin:.5rem 0">Switching weeks or days without saving discards unsaved edits.</p>
    <button class="btn-primary" id="save-day-btn" style="width:100%">Save Day</button>
    <hr style="border-color:var(--border);margin:1rem 0">
    ${renderUploadSection(progId)}
  `;
  setupBlockEditorEvents(container, progId);
  setupUploadEvents(container, progId, () => renderBlockEditor(container, progId));
}
```

The week tab row reuses the existing `.block-day-tabs` CSS class (already styled with flex/gap/margin — no new CSS needed) alongside `.ctrl-pill.week-pill`, the exact classes Today's own week pills already use (`js/today.js`'s `session-ctrl-bar` week row), so the two controls look visually consistent across the app.

- [ ] **Step 3: Add the week-tab click handler and make the day-save handler week-scoped**

Current `setupBlockEditorEvents` (`js/programme-editor.js:214-239`):
```js
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
```

Replace with:
```js
function setupBlockEditorEvents(container, progId) {
  container.querySelectorAll('[data-edweek]').forEach(btn => {
    btn.addEventListener('click', async () => {
      editorWeek = +btn.dataset.edweek;
      await renderBlockEditor(container, progId);
    });
  });

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
    const weekSessions = await getWeekSessions(progId, editorWeek);
    const label = container.querySelector('#ed-day-label')?.value || '';
    const focus = container.querySelector('#ed-day-focus')?.value || '';
    weekSessions[editorDay] = { label, focus, blocks: editingBlocks };
    weekSessions.weekLabel = container.querySelector('#ed-week-label')?.value || '';
    weekSessions.weekHint = container.querySelector('#ed-week-hint')?.value || '';
    await saveWeekSessions(progId, editorWeek, weekSessions);
    showToast('Day saved');
  });

  bindBlockListEvents(container, progId);
}
```

Note: `bindBlockListEvents`, `refreshBlockList`, `readBlocksFromDom`, and everything under the "Task 8" exercise-block section are **unchanged** — none of them read or write session data directly, they only mutate the in-memory `editingBlocks` array that `#save-day-btn` reads from on save.

- [ ] **Step 4: Rewrite `importJsonProgramme` to handle both `weeks` and `days`, merging into (not replacing) existing data**

Current (`js/programme-editor.js:419-447`):
```js
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
      const validTypes = new Set(BLOCK_TYPES.map(t => t.type));
      const blocks = dayData.blocks
        .filter(b => b && validTypes.has(b.type))
        .map(b => {
          if (b.type === 'warmup' || b.type === 'core') return { ...b, items: Array.isArray(b.items) ? b.items : [] };
          if (b.type === 'skill' || b.type === 'strength' || b.type === 'circuit') return { ...b, exercises: Array.isArray(b.exercises) ? b.exercises : [] };
          return b; // cardio/mobility have no array field to coerce
        });
      sessions[dayNum] = { label: dayData.label || '', focus: dayData.focus || '', blocks };
    } else {
      const exercises = (dayData.exercises || []).map(ex =>
        typeof ex === 'string' ? { name: ex } : { name: ex.name, sets: ex.sets, reps: ex.reps ? String(ex.reps) : undefined }
      );
      sessions[dayNum] = { label: dayData.label || '', focus: '', blocks: exercises.length ? [{ type: 'strength', exercises }] : [] };
    }
  }
  await saveSessions(progId, sessions);
}
```

Replace with:
```js
// Simple flat shape: { name, description, days: { Monday: { label, exercises: [{name,sets,reps}|string] } } }
// — applied to Week 1, then flat-copied to weeks 2-4 (no legacy scaling — that replay is
// specific to the pre-existing A/B migration, not a rule for new uploads).
// Advanced shape: { name, description, weeks: { "1": { weekLabel?, weekHint?, days: {...} }, "2": {...}, ... } }
// — each week's `days` may use `blocks: [...]` instead of `exercises` for full control.
// Both shapes merge into the programme's existing 4-week data — only days actually
// present in the file are touched; everything else is left as-is.
const VALID_BLOCK_TYPES = new Set(BLOCK_TYPES.map(t => t.type));

function parseUploadedDay(dayData) {
  if (Array.isArray(dayData.blocks)) {
    const blocks = dayData.blocks
      .filter(b => b && VALID_BLOCK_TYPES.has(b.type))
      .map(b => {
        if (b.type === 'warmup' || b.type === 'core') return { ...b, items: Array.isArray(b.items) ? b.items : [] };
        if (b.type === 'skill' || b.type === 'strength' || b.type === 'circuit') return { ...b, exercises: Array.isArray(b.exercises) ? b.exercises : [] };
        return b; // cardio/mobility have no array field to coerce
      });
    return { label: dayData.label || '', focus: dayData.focus || '', blocks };
  }
  const exercises = (dayData.exercises || []).map(ex =>
    typeof ex === 'string' ? { name: ex } : { name: ex.name, sets: ex.sets, reps: ex.reps ? String(ex.reps) : undefined }
  );
  return { label: dayData.label || '', focus: '', blocks: exercises.length ? [{ type: 'strength', exercises }] : [] };
}

async function importJsonProgramme(file, progId) {
  const text = await file.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Invalid JSON file'); }
  if (!data.weeks && !data.days) throw new Error('Missing "weeks" or "days" field — see template for format');

  const sessions = await getSessions(progId); // full 4-week object — merge into it

  if (data.weeks) {
    for (const [weekKey, weekData] of Object.entries(data.weeks)) {
      const weekNum = parseInt(weekKey, 10);
      if (![1, 2, 3, 4].includes(weekNum)) throw new Error(`Invalid week "${weekKey}" — use 1, 2, 3, or 4`);
      if (weekData.weekLabel) sessions[weekNum].weekLabel = weekData.weekLabel;
      if (weekData.weekHint) sessions[weekNum].weekHint = weekData.weekHint;
      for (const [dayName, dayData] of Object.entries(weekData.days || {})) {
        const dayNum = PROG_DAY_MAP[dayName.toLowerCase()];
        if (dayNum === undefined) throw new Error(`Unknown day "${dayName}" — use Monday, Tuesday, etc.`);
        sessions[weekNum][dayNum] = parseUploadedDay(dayData);
      }
    }
  } else {
    for (const [dayName, dayData] of Object.entries(data.days)) {
      const dayNum = PROG_DAY_MAP[dayName.toLowerCase()];
      if (dayNum === undefined) throw new Error(`Unknown day "${dayName}" — use Monday, Tuesday, etc.`);
      const parsed = parseUploadedDay(dayData);
      sessions[1][dayNum] = parsed;
      for (const w of [2, 3, 4]) sessions[w][dayNum] = JSON.parse(JSON.stringify(parsed));
    }
  }

  await saveSessions(progId, sessions);
}
```

- [ ] **Step 5: Update the PDF/Word simple-parse handler to merge into Week 1 and flat-copy to weeks 2-4**

Current (`js/programme-editor.js:591-608`, inside `setupUploadEvents`):
```js
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
        setTimeout(onDone, 1000);
      } else {
```

Replace with:
```js
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
        const parsedWeek1 = wrapParsedDaysAsBlocks(parsedDays);
        Object.assign(sessions[1], parsedWeek1);
        for (const dayNum of Object.keys(parsedWeek1)) {
          for (const w of [2, 3, 4]) sessions[w][dayNum] = JSON.parse(JSON.stringify(sessions[1][dayNum]));
        }
        await saveSessions(progId, sessions);
        status.textContent = `✓ Parsed ${totalEx} exercises into Strength blocks (Week 1, copied to weeks 2-4) — refine with the block builder above.`;
        status.style.color = 'var(--success)';
        setTimeout(onDone, 1000);
      } else {
```

`wrapParsedDaysAsBlocks` itself is **unchanged** — it still returns a single week's `{dayNum: dayObj}` mapping; only its caller now scopes that into `sessions[1]` and flat-copies to the other three weeks.

- [ ] **Step 6: Update the upload section's description text and the downloadable template**

Current (`js/programme-editor.js:399-413`):
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
```

Replace with:
```js
function renderUploadSection(progId) {
  return `
    <p class="muted" style="font-size:.8rem;margin-bottom:.5rem">
      Upload a <strong>PDF</strong>, <strong>Word</strong>, or <strong>JSON</strong> file to fill this programme.
      PDF/Word and simple JSON (a <code>days</code> field) produce one Strength block per day, copied across
      all 4 weeks — refine with the block builder above. JSON with a <code>weeks</code> field (each week its
      own <code>days</code>, optionally full <code>blocks</code> arrays) gives every week genuinely distinct
      content in one upload — see the template.
    </p>
    <div class="add-item-row" style="margin-bottom:.5rem">
      <button class="btn-primary" id="upload-prog-btn" style="flex:1">📋 Upload Programme</button>
      <button class="btn-secondary" id="download-prog-template">⬇ Template</button>
    </div>
    <input type="file" id="upload-prog-input" accept=".pdf,.doc,.docx,.json" style="display:none">
    <div id="upload-prog-status" style="font-size:.85rem"></div>
  `;
}
```

Current download-template handler (`js/programme-editor.js:623-649`):
```js
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
```

Replace with:
```js
  container.querySelector('#download-prog-template')?.addEventListener('click', () => {
    const template = {
      name: 'My Programme',
      description: 'Optional — e.g. 4-day upper/lower split',
      weeks: {
        1: {
          weekLabel: 'Foundation', weekHint: 'Base sets and reps as written',
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
        },
        2: {
          weekLabel: 'Intensification', weekHint: 'Heavier loads, lower reps',
          days: {
            Monday: { label: 'Push — Heavy', exercises: [{ name: 'Bench Press', sets: 5, reps: '4-6' }] },
          },
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
```
(Weeks 3-4 are intentionally omitted from the template — it only needs to demonstrate the shape, not provide exhaustive content for every week. Any week not present in an uploaded `weeks` object is simply left untouched by the merge in Step 4.)

- [ ] **Step 7: Syntax-check and grep-verify**

Run: `cd /home/z/Projects/mystats-pwa && node --input-type=module < js/programme-editor.js`
Expected: module-resolution error only (e.g. `ERR_MODULE_NOT_FOUND` for `./db.js`), no `SyntaxError`.

Run: `cd /home/z/Projects/mystats-pwa && grep -n "getSessions(progId)" js/programme-editor.js`
Expected: exactly 2 matches — inside `importJsonProgramme` and the PDF/Word handler (both correctly still use the full-programme `getSessions`, per Step 4/5). If `#save-day-btn`'s handler still shows up in this grep, Step 3 was not applied correctly.

- [ ] **Step 8: Commit**

```bash
cd /home/z/Projects/mystats-pwa
git add js/programme-editor.js
git commit -m "feat: week selector in block editor, weeks-aware programme upload

The block builder gains a W1-W4 tab row (same ctrl-pill styling Today's
own week picker uses) plus per-week label/hint fields, and its manual
day-save now writes through the week-scoped saveWeekSessions instead of
the whole-programme saveSessions.

The JSON upload path gains a 'weeks' key for full per-week detail in one
upload (each week its own days, optionally full blocks arrays); the old
'days'-only format still works, now applied to Week 1 and flat-copied to
weeks 2-4 rather than the old single-week write. The PDF/Word auto-parse
path does the same flat-copy. Both upload handlers keep their existing
merge-not-replace behavior — only days actually present in a file are
touched. Fixed a validation gap where a weeks-only upload would have
been rejected outright (the old guard required 'days' unconditionally)."
```

---

### Task 4: Bump service worker cache, deploy, and run the full live verification checklist

**Files:**
- Modify: `sw.js:1` (cache version bump only — `js/programmes.js`, `js/today.js`, `js/programme-editor.js` are already listed in `ASSETS`, no changes needed there)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this task is deploy + verification only.

- [ ] **Step 1: Bump the cache version**

Current (`sw.js:1`):
```js
const CACHE = 'mystats-v48';
```

Replace with:
```js
const CACHE = 'mystats-v49';
```

- [ ] **Step 2: Commit**

```bash
cd /home/z/Projects/mystats-pwa
git add sw.js
git commit -m "chore: bump SW cache to v49 for four-week programme storage"
```

- [ ] **Step 3: Start a local server and run the live verification scenarios**

```bash
cd /home/z/Projects/mystats-pwa
vercel dev --listen 3213 --yes &
sleep 6
```

Using Playwright MCP tools (`browser_navigate` to `http://localhost:3213`, `browser_evaluate` for IndexedDB seeding/inspection, `browser_snapshot` for visual checks), work through every scenario from the spec's testing plan:

1. **Old-shape → new-shape migration, zero visual regression.** Before loading the app, seed `programme_a_sessions` and `programme_b_sessions` directly in the OLD single-week shape (copy the current `PROG_A_SESSIONS`/`PROG_B_SESSIONS` structure from `js/profile.js` into a `browser_evaluate` call using raw `indexedDB.open('mystats')`, matching the seeding pattern used earlier this session — remember to call `db.close()` after the transaction completes to avoid a hung `deleteDatabase` later). Load the app, navigate to Today, and for each of Programme A and B, check all 4 weeks' Monday session: sets/reps/hold values and block notes must match exactly what the pre-migration code produced (Week 2 skill exercises: sets unchanged, hold targets +2s; Week 3: all sets +1; Week 4: sets unchanged, "Deload" note shown; Week 1: untouched). This is the critical no-regression check — any mismatch here blocks the whole task.
2. **Migration persists, doesn't re-run.** Reload the app a second time; confirm the settings key is now in the new shape (inspect via `indexedDB.open` + `get('programme_a_sessions')`) and that Today still renders identically — no drift between the first and second load.
3. **Block editor week independence.** In Setup → Programmes → Edit Programme A, switch between W1-W4, confirm each shows different content (post-migration, weeks 2-4 differ from week 1 per the materialized scaling), edit one exercise's sets in Week 3 only, save, switch to Week 1 and Week 4, confirm neither changed.
4. **New custom programme starts uniform.** Create a new programme, confirm all 4 weeks are empty rest days in the editor, edit Week 3 Monday only, save, confirm Weeks 1/2/4 Monday are still empty rest days.
5. **Old-format JSON upload flat-copies.** Use the "Template" download, remove its `weeks` key, add a top-level `days` key instead (old format) with one day's exercises, upload it, confirm all 4 weeks show that exact same day's content.
6. **New-format JSON upload keeps weeks distinct.** Upload a `weeks`-keyed JSON (e.g. the current template, which already has genuinely different Week 1 vs Week 2 Monday content) and confirm Today shows the correct distinct content per week.
7. **Fresh install, no migration path taken.** Clear all IndexedDB data (`indexedDB.deleteDatabase('mystats')`, remembering the close-before-delete rule), reload, complete onboarding, confirm A/B appear correctly with 4 distinct weeks from a single seeding pass (no separate migration step involved — check there's no old-shape intermediate state at any point).
8. **"Prev" reference regression check.** Seed synthetic `today-log` workouts with explicit `programme`/`week`/`day` fields matching a specific day, ensure that programme is in the OLD single-week shape before load (triggering migration), then after migration confirm the Today tab's "prev" column still shows the correct prior session for that exact programme+week+day combination — a real before/after render check, not just a code-level claim.

Record the outcome of each scenario. If any scenario fails, stop and fix before proceeding — do not defer failures to a later task.

- [ ] **Step 4: Stop the local server**

```bash
pkill -f "vercel dev --listen 3213"
```

- [ ] **Step 5: Deploy to production**

```bash
cd /home/z/Projects/mystats-pwa
vercel --prod --yes
git push origin main
```

- [ ] **Step 6: Verify against the live production URL**

Repeat scenario 1 (old-shape migration, zero visual regression) against `https://mystats-pwa-ochre.vercel.app/` with a freshly cleared service worker/cache (unregister + clear caches via `browser_evaluate`, matching the clean-navigation pattern used earlier this session) to confirm the deployed build behaves identically to the local verification.