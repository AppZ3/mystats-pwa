# Auto PR Detection — Design

**Status:** Approved, not yet planned/implemented. Deliberately queued behind the in-progress multi-programme-support work (separate worktree/branch) to avoid two concurrent implementation efforts touching overlapping files (`today.js`, `sw.js`).

## Problem

The PR board (`js/prs.js`) currently only grows through manual entry — you have to remember to open the PR form and type in a weight/reps/hold value after the fact. Every set you log on Today or Train already contains this information; the board should update itself.

## Goals

- Every set logged, on both the Today tab (`js/today.js`) and Train tab (`js/workout.js`), is checked against that exercise's current best at save time. A strictly-greater value becomes a new PR record automatically.
- Skill exercises (front lever, planche, etc.) are covered by the same logic as weighted/bodyweight exercises — no separate code path.
- A one-time backfill scans all existing `workouts` records so the board reflects real all-time bests immediately, not just sessions logged after this ships.
- New PRs get an in-the-moment toast after save ("🏆 New PR: Weighted pull-up 15kg!") — reward-only, never blocks or gates anything.
- The existing manual "+ Add PR" flow (`js/prs.js:14-70`) is untouched — still available for off-programme attempts (e.g. a gym max effort not logged as a session).

## Non-goals

- No per-exercise opt-in/opt-out UI. Every exercise is auto-tracked; YAGNI on a settings toggle until it's actually wanted.
- No estimated-1RM scoring (Epley or otherwise) — ranking is the raw heaviest weight ever lifted, independent of reps on that set (matches the existing `TYPE_CONFIG.weight` semantics in `js/prs.js:3-8`, and confirmed by the user).
- No change to the PR record's stored shape (`{exercise, type, value, unit, date, notes}` — see `js/prs.js:145`, `dbAdd('prs', {...})`). Auto-created records are indistinguishable from manual ones; deleting an auto-created PR simply means the next qualifying set recreates it (expected, not a bug — there's no "dismiss forever" concept here).

## Data flow

**Existing exercise-record shape** (both `js/today.js:96` and `js/workout.js` build this same shape — confirmed identical fields):
```js
{ name: 'Weighted pull-up', sets: [{ weight: 12.5, reps: '6', note: '' }], notes: '', hold: '', level: '' }   // strength
{ name: 'Tuck front lever hold', sets: [], notes: '', hold: '8s', level: '' }                                  // skill (hold-based)
{ name: 'Muscle-up negative', sets: [], notes: '', hold: '3 reps', level: '' }                                 // skill (rep-based — same `hold` field, different string shape)
```
(`_warmup`, `_run`, and `_core:*`/`_circuit:*` checklist-style pseudo-exercises are skipped — they have no weight/reps/hold to rank.)

**New module `js/pr-detect.js`** — pure function, no DOM, callable from both `today.js` and `workout.js`:

```js
// scanForPRs(exercises: ExerciseRecord[], date: string) => Promise<{exercise, type, value, unit}[]>
// For each exercise in the array:
//   - skip names starting with '_' (pseudo-exercises)
//   - if sets contains any set with a numeric weight > 0: candidate = {type:'weight', unit:'kg', value: max weight across sets}
//   - else if sets contains any set with numeric reps and no weight: candidate = {type:'reps', unit:'reps', value: max reps across sets}
//   - else if hold is non-empty: parse leading number via /^(\d+(\.\d+)?)/
//       - if the remainder (after the number) starts with 's' (case-insensitive) → {type:'hold', unit:'sec', value: number}
//       - else (e.g. contains 'rep') → {type:'reps', unit:'reps', value: number}
//   - else: no candidate for this exercise (nothing logged)
//   - compare candidate.value against the current best for (exercise, type) — read via one dbGetAll('prs') call, done once per scan, not per exercise
//   - if candidate.value > current best (or no existing record for that exercise/type): this is a new PR
// Returns the list of newly-set PRs (empty array if none), and — as a side effect — writes each one via dbAdd('prs', {exercise, type, value, unit, date, notes: 'Auto-logged'})
```

One exercise name maps to exactly one type at any point in its history (whichever branch matched first, in the fixed order above: weight > reps > hold-derived). This avoids the pre-existing display quirk where `js/prs.js`'s `byExercise` grouping (line ~17) sorts all records for an exercise name together regardless of `type` — mixing a `kg` value and a `reps` value under one card would misrank. Auto-detection sidesteps this by being consistent per exercise, not by fixing the underlying grouping (out of scope here).

## Integration points

- **`js/today.js:772-775`** (session save handler) — after the existing `dbPut`/`dbAdd('workouts', ...)` call, pass `workoutData.exercises` and `workoutData.date` to `scanForPRs`. If it returns any new PRs, show a toast per new PR (or one combined toast if more than one — combined phrasing: "🏆 2 new PRs: Weighted pull-up 15kg, Front lever hold 12s").
- **`js/workout.js:235-247`** (save-workout handler) — identical integration, using `currentSession.exercises` / `currentSession.date`.
- Toast mechanism: both files already have their own local `showToast` (matches the pattern already duplicated across `settings.js`/`prs.js`/the new `programme-editor.js` from the concurrent multi-programme work) — reuse each file's existing one, no new shared toast module needed.

## Backfill migration

Same seeded-once pattern as `js/programmes.js`'s `ensureSeeded()` (from the concurrent multi-programme-support work) — a settings-store flag guards a one-time run:

```js
// in js/pr-detect.js
export async function ensurePRBackfill() {
  const done = await dbGet('settings', 'pr_backfill_done');
  if (done) return;
  const allWorkouts = await dbGetAll('workouts');
  const sorted = [...allWorkouts].sort((a, b) => a.date.localeCompare(b.date)); // oldest first, so "current best" accumulates correctly as we walk forward
  for (const w of sorted) {
    await scanForPRs(w.exercises || [], w.date);
  }
  await dbPut('settings', { key: 'pr_backfill_done', value: true });
}
```
Called once during `app.js` init, alongside the existing `ensureSeeded()` call from the multi-programme work — same place, same pattern, no new init-time architecture.

**No toast fires for backfill-created PRs** — the celebratory moment is for *just* setting a new record, not for a bulk historical migration running silently at app startup. `scanForPRs` itself doesn't know it's being called from a backfill vs. a live save; the caller (backfill loop vs. save handler) decides whether to surface the returned list as a toast.

## Edge cases

- **Tied value** (new set exactly matches current best, doesn't exceed it): not a new PR — strictly-greater only, matching how a human would judge "did I actually improve."
- **Multiple qualifying sets in one session** (e.g. two sets both above the old best): only the single best set in that session counts; only one new-PR record is written per exercise per session, not one per set.
- **Exercise never logged before**: any qualifying set is automatically a new PR (no prior record to beat).
- **Deleted PR re-appears**: documented under Non-goals — expected behavior, not a defect.
- **Backfill on a fresh install with zero workout history**: loop body never executes, flag still gets set, no-op — safe.

## Testing approach

No automated test framework exists in this repo (confirmed via the concurrent multi-programme-support plan's Global Constraints). Verification is manual: run the app, log a session with a weight above/below/equal to an existing manual PR, confirm the correct toast/no-toast behavior and that the PR board reflects it. Backfill is verified by clearing IndexedDB, importing a backup with real historical workout data, reloading, and confirming the PR board populates without any session being re-logged.
