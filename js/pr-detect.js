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
