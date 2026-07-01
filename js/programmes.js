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
