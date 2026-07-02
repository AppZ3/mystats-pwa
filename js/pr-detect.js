import { dbGet, dbPut, dbGetAll, dbAdd, dbDelete } from './db.js';

const TYPE_PRIORITY = { weight: 0, hold: 1, reps: 2 }; // lower number wins when a name's PRs conflict in type

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

// `recordFor` is keyed by `${exercise}|${type}` -> {id, value, notes} for the current
// best record of that exercise+type (whether pre-existing or written during this run).
// `canonicalType` is keyed by exercise -> highest-priority type currently active for
// that name. Both are mutated in place, so callers can share one pair across many
// calls (e.g. every historical workout in a backfill) without re-reading the whole
// `prs` store per call — that per-call re-read was slow enough on real workout
// history to blow past the 5s "stuck loading" recovery threshold in js/recovery.js.
async function scanAgainstState(exercises, date, recordFor, canonicalType) {
  const newPRs = [];
  for (const ex of exercises) {
    if (!ex.name || ex.name.startsWith('_')) continue;
    const candidate = detectCandidate(ex);
    if (!candidate) continue;

    const existingType = canonicalType.get(ex.name);
    if (existingType !== undefined && existingType !== candidate.type) {
      if (TYPE_PRIORITY[candidate.type] < TYPE_PRIORITY[existingType]) {
        // Candidate outranks the name's current type (e.g. a weight record now exists
        // for a name that previously only had bodyweight-reps records) — the candidate
        // becomes the new canonical type; remove the now-superseded AUTO-LOGGED record
        // (never touch manual ones) so the board doesn't mix units under one name.
        const oldKey = `${ex.name}|${existingType}`;
        const old = recordFor.get(oldKey);
        if (old && old.notes === 'Auto-logged') {
          await dbDelete('prs', old.id);
          recordFor.delete(oldKey);
        }
        canonicalType.set(ex.name, candidate.type);
      } else {
        // The name's existing type outranks this candidate (e.g. a weight record already
        // exists, candidate is bodyweight-reps) — skip entirely rather than create a
        // second, incomparable-unit record under the same name.
        continue;
      }
    }

    const key = `${ex.name}|${candidate.type}`;
    const existing = recordFor.get(key);
    if (existing === undefined || candidate.value > existing.value) {
      const record = {
        exercise: ex.name,
        type: candidate.type,
        value: candidate.value,
        unit: candidate.unit,
        date,
        notes: 'Auto-logged',
      };
      const id = await dbAdd('prs', record);
      newPRs.push(record);
      recordFor.set(key, { id, value: candidate.value, notes: 'Auto-logged' }); // guards against the same exercise name appearing twice in one save
    }
  }
  return newPRs;
}

function buildStateFromPRs(allPRs) {
  const recordFor = new Map();
  const canonicalType = new Map();
  for (const pr of allPRs) {
    const key = `${pr.exercise}|${pr.type}`;
    const cur = recordFor.get(key);
    if (cur === undefined || pr.value > cur.value) recordFor.set(key, { id: pr.id, value: pr.value, notes: pr.notes });
    const existingType = canonicalType.get(pr.exercise);
    if (existingType === undefined || TYPE_PRIORITY[pr.type] < TYPE_PRIORITY[existingType]) {
      canonicalType.set(pr.exercise, pr.type);
    }
  }
  return { recordFor, canonicalType };
}

export async function scanForPRs(exercises, date) {
  const allPRs = await dbGetAll('prs');
  const { recordFor, canonicalType } = buildStateFromPRs(allPRs);
  return scanAgainstState(exercises, date, recordFor, canonicalType);
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

  // One dbGetAll('prs') read for the entire backfill, not one per workout — see
  // scanAgainstState's comment for why this matters.
  const allPRs = await dbGetAll('prs');
  const { recordFor, canonicalType } = buildStateFromPRs(allPRs);
  for (const w of sorted) {
    await scanAgainstState(w.exercises || [], w.date, recordFor, canonicalType);
  }
  await dbPut('settings', { key: 'pr_backfill_done', value: true });
}
