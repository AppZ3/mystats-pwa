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
