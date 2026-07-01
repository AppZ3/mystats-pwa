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

export async function scanForPRs(exercises, date) {
  const allPRs = await dbGetAll('prs');
  const bestFor = new Map(); // `${exercise}|${type}` -> current best value
  const canonicalType = new Map(); // exercise -> highest-priority type seen across all existing PRs for that name
  for (const pr of allPRs) {
    const key = `${pr.exercise}|${pr.type}`;
    const cur = bestFor.get(key);
    if (cur === undefined || pr.value > cur) bestFor.set(key, pr.value);
    const existingType = canonicalType.get(pr.exercise);
    if (existingType === undefined || TYPE_PRIORITY[pr.type] < TYPE_PRIORITY[existingType]) {
      canonicalType.set(pr.exercise, pr.type);
    }
  }

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
        // becomes the new canonical type; remove the now-superseded AUTO-LOGGED records
        // (never touch manual ones) so the board doesn't mix units under one name.
        const superseded = allPRs.filter(pr => pr.exercise === ex.name && pr.type === existingType && pr.notes === 'Auto-logged');
        for (const old of superseded) await dbDelete('prs', old.id);
        canonicalType.set(ex.name, candidate.type);
      } else {
        // The name's existing type outranks this candidate (e.g. a weight record already
        // exists, candidate is bodyweight-reps) — skip entirely rather than create a
        // second, incomparable-unit record under the same name.
        continue;
      }
    }

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
