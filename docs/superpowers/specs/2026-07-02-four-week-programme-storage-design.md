# Four-Week Programme Storage — Design Spec

## Problem

Every programme (including the built-in A and B) currently stores exactly
one week of blocks per day. Weeks 2-4 are derived at render time in
`js/today.js` by a generic scaling function (`weekMods()`): add a set here,
bump a hold by 2 seconds there, append a note. This works for programmes
that really are "the same workout, slightly heavier" week to week — but it
cannot represent a programme where Week 3 introduces exercises that never
appear in Week 1 at all, which is how real periodized programmes (including
the ones the user is trying to import right now) are actually written.

The immediate trigger: the user is trying to import 5 custom calisthenics
programmes (C-G) from Word documents, each with a genuinely distinct
4-week progression (different exercises, not just scaled sets/reps per
week). The current data model cannot store that, so importing them any
other way than by hand loses real programming detail.

## Goals

- Every programme (A, B, and all custom programmes) stores four
  genuinely independent weeks of blocks — no generic scaling.
- Existing users (with A/B already seeded in the old single-week shape)
  get migrated automatically and silently, with **zero change** to what
  they see on day one.
- The block editor (`js/programme-editor.js`) gains a week selector so any
  week can be edited independently.
- The advanced JSON upload format gains a `weeks` key so future full-parity
  imports (hand-converted or, later, auto-parsed) can carry real per-week
  detail. Old-format uploads (no `weeks` key) keep working.
- Each programme can define its own week labels/hints (e.g. "Skill
  Acquisition + Strength Foundation") instead of sharing one hardcoded
  global set.

## Non-goals

- No changes to workout history (`workouts` store) or PR detection —
  this only touches the programme *blueprint* storage.
- No smarter DOCX/PDF auto-parser (tables, multi-week sections) — tracked
  separately, out of scope here.
- No hand-conversion of the user's 5 real documents — that happens after
  this ships, as its own follow-up step, using the format this spec defines.

## Data model

**Old shape** (per programme, `settings` key `programme_<id>_sessions`):
```
{ 0: dayObj, 1: dayObj, ..., 6: dayObj }   // day-of-week keys, one week
```

**New shape:**
```
{
  1: { 0: dayObj, ..., 6: dayObj, weekLabel: 'Foundation', weekHint: '...' },
  2: { 0: dayObj, ..., 6: dayObj, weekLabel: 'Intensification', weekHint: '...' },
  3: { ... },
  4: { ... },
}
```
`weekLabel`/`weekHint` are optional per-week strings. When absent, the UI
falls back to global `WEEK_LABELS`/`WEEK_HINTS` arrays (index by week
number) so any programme missing them still shows something sensible.
That fallback text is neutral ("Week 1", "Week 2", "Week 3", "Week 4", no
hint) — **not** A/B's specific "Foundation/Intensification/Volume/Deload"
language. Once migrated, A/B always carry their own explicit `weekLabel`/
`weekHint` (see Migration below), so the global fallback only ever fires
for a brand-new, not-yet-filled-in custom programme — and "Foundation"
implies a periodization philosophy that a blank programme doesn't have.

`dayObj` keeps its existing shape (`{ label, focus, blocks }`) —
unchanged. Blocks keep their existing per-type shape. One addition:
`strength` blocks gain the same optional `note` field `skill` blocks
already have (currently only `skill` blocks render a block-level note);
`renderStrengthBlock` starts displaying it the same way `renderSkillBlock`
already does. This is what carries the old `weekMods().blockNote` text
("Heavy — lower reps, advance skill" etc.) for migrated weeks 2-4.

## Migration (existing A/B and any pre-existing custom programme)

`js/programmes.js`'s `getSessions(id)` detects shape by checking whether
the stored value has a top-level day key (`0`-`6` — old shape always has
all seven; new shape never has a top-level `0`). On first read of
old-shape data, it materializes weeks 2-4 by literally replaying what
`weekMods()`/`applyHoldBonus()` already compute today:

- `skill` blocks: each exercise's `sets` gets `+extraSets`, `target` gets
  `applyHoldBonus(target, holdBonus)`; block-level `note` is set to the
  week's `blockNote` (weeks with no note leave it unset).
- `strength` blocks: each exercise's `sets` gets `+extraSets` (reps
  unchanged — matches current behavior, which never adjusts reps text);
  block-level `note` set to the week's `blockNote`.
- All other block types (`warmup`, `core`, `circuit`, `cardio`,
  `mobility`): cloned unchanged — `weekMods()` never touched these today,
  so migrated weeks don't either.
- Migrated weeks 2-4 get `weekLabel`/`weekHint` set from today's
  `WEEK_LABELS`/`WEEK_HINTS` arrays (`Intensification`/`Volume`/`Deload`
  with their existing hint text), so A/B's on-screen week picker shows
  exactly what it shows today.

The migrated 4-week object is written back to `settings` immediately (the
read call becomes self-healing/idempotent — next read sees the new shape
and skips migration). This means the fix applies automatically the next
time `getSessions` is called for that programme, with no separate
migration step or user action required. `weekMods()` and `applyHoldBonus()`
move from `js/today.js` into `js/programmes.js` (their only remaining
caller is this migration path) and are deleted from `today.js` along with
their three call sites — blocks render their stored values directly.

**Concurrent calls are safe.** `getSessions` can be called from more than
one place close together (e.g. Today and Settings both loading near
startup). Migration is a pure function of the stored old-shape data, so
if two calls both read old-shape data before either has written the
migrated result, both compute the identical 4-week object and both write
it — redundant, but harmless. There's no path where a caller observes a
torn or partially-migrated result.

**Fresh installs** (`ensureSeeded()`, no existing data at all) write A/B
directly in the new 4-week shape — the migration path never runs for them.

**Backup re-import doesn't need special handling.** `importBackup()` in
`js/settings.js` upserts every key present in the backup's `settings`
array — an old backup taken before this ships could reintroduce an
old-shape `programme_a_sessions`/`programme_b_sessions` value on import.
This needs no new code: the next `getSessions` read for that programme
detects the old shape (same check as any other old-shape data) and
re-migrates it. Worst case is one redundant migration cycle, not a
lasting regression — consistent with "Concurrent calls are safe" above.

**Key entirely missing** (a programme listed in `programmes_list` whose
`programme_<id>_sessions` key doesn't exist at all — the exact shape of
bug seen on the user's device with the pre-4-week rollout): `getSessions`
returns `emptyFourWeeks()` (four weeks of all-rest-day placeholders), not
the old single-week `emptyWeek()`. This is a plain empty-state fallback,
not a migration — there is nothing to migrate — but it must be spelled
out explicitly since a missing key is exactly the failure mode that
caused a real bug before this spec.

## API changes (`js/programmes.js`)

- `getSessions(id)` → now returns the full 4-week object `{1:{...},
  2:{...}, 3:{...}, 4:{...}}` (was: one week's day object). Handles
  migration internally as described above. If the `programme_<id>_sessions`
  key doesn't exist at all, returns `emptyFourWeeks()` (see "Key entirely
  missing" above) — never the old `emptyWeek()`.
- `getWeekSessions(id, week)` (new) → `{ 0: dayObj, ..., 6: dayObj }` for
  one week. Thin wrapper: `(await getSessions(id))[week] ?? emptyWeek()`.
- `saveWeekSessions(id, week, daySessions)` (new) → reads the full 4-week
  blob, replaces week `week`'s day object, writes back. This is what the
  block editor calls when saving edits to one week+day.
- `saveSessions(id, allWeeks)` (signature change) → now expects/writes the
  full `{1:...,2:...,3:...,4:...}` shape (was: one week). Used by the
  upload/import path, which writes an entire programme at once.
- `getProgrammeSession(id, week, day)` (signature change, adds `week`) →
  `(await getWeekSessions(id, week))[day] ?? {...REST_DAY}`.
- `createProgramme(name)` seeds a fresh 4-week object (all four weeks
  identical empty rest days) instead of one week.

## `js/today.js` changes

- `getProgrammeSession(prog, selectedDay)` call becomes
  `getProgrammeSession(prog, activeWeek, selectedDay)`.
- Delete `weekMods()`, `applyHoldBonus()`, and their three call sites in
  `renderSkillBlock`/`renderStrengthBlock`. Those functions read
  `ex.sets`/`ex.target`/`ex.reps`/`block.note` directly — the stored data
  is already the correct value for the active week.
- `renderStrengthBlock` gains a block-level note display (reads
  `block.note`, same pattern `renderSkillBlock` already uses) so migrated
  weeks 2-4 keep showing their note text.
- `WEEK_LABELS`/`WEEK_HINTS` module constants stay as the fallback for
  programmes/weeks that don't define their own `weekLabel`/`weekHint`.
  Wherever today.js currently indexes them by `activeWeek`, it first checks
  the active week's own `weekLabel`/`weekHint` (from `getWeekSessions`),
  falling back to the constant arrays if absent.
- No changes to `getPrevExercise` — workout history matching is untouched
  by this migration (it already matches on exact `programme`+`week`+`day`
  from saved workout records, independent of blueprint storage shape).

## `js/programme-editor.js` changes

- New module state `editorWeek` (default `1`), alongside the existing
  `editorDay`.
- `renderBlockEditor` renders a week pill row (`W1`–`W4`) above the
  existing day tabs, reusing the same `.ctrl-pill` styling Today's own
  week/day pills already use — same interaction pattern, one more
  dimension. Switching week reloads that week's day tabs via
  `getWeekSessions(progId, editorWeek)`.
- This file has three existing `getSessions`/`saveSessions` call sites,
  and they do **not** all convert the same way:
  - The manual block editor's `#save-day-btn` handler (saves one day's
    edited blocks) is week-scoped: becomes `getWeekSessions(progId,
    editorWeek)` / `saveWeekSessions(progId, editorWeek, sessions)`.
  - `importJsonProgramme` (handles both the simple and advanced JSON
    upload formats) and the PDF/Word auto-parse handler both write an
    entire programme at once — they build a full 4-week object per the
    "Upload format changes" rules below, then call `saveSessions(progId,
    fullFourWeekObject)`, **not** `saveWeekSessions`. Neither of these
    call sites should be touched by the "manual editor" conversion above.
- A small per-week "label/hint" text field pair is added to the week pill
  row's area, editing that week's `weekLabel`/`weekHint` directly in the
  stored week object.

## Upload format changes

Advanced JSON format extends from:
```json
{ "name": "...", "description": "...", "days": { "Monday": {...}, ... } }
```
to:
```json
{
  "name": "...", "description": "...",
  "weeks": {
    "1": { "weekLabel": "...", "weekHint": "...", "days": { "Monday": {...}, ... } },
    "2": { ... }, "3": { ... }, "4": { ... }
  }
}
```
Import logic (`importJsonProgramme` in `js/programme-editor.js`): if
`weeks` is present, use it directly (validated/coerced per-week with the
same block-type whitelist + `items`/`exercises` coercion the current
single-week import already does). If `weeks` is absent but `days` is
present (old-format upload), treat `days` as Week 1 and copy it verbatim
into weeks 2-4 (a flat copy, not the legacy `weekMods()` materialization
— that replay is specific to the pre-existing A/B migration, not a
general rule for new uploads). This keeps every existing shared programme
file valid without changes. **Validation gate change:** the function's
current guard (`if (!data.days || typeof data.days !== 'object') throw
...`) unconditionally requires `days` and would reject a `weeks`-only
file outright — it must change to require *either* `weeks` or `days` (at
least one present), not `days` specifically.

The simple (non-advanced) DOCX/PDF/text auto-parse path (the PDF/Word
handler that calls `wrapParsedDaysAsBlocks`) is unaffected in scope — it
still only ever produces one week's worth of exercises. That single
parsed week gets copied across all 4 weeks the same way an old-format
`days`-only JSON upload does, before being written with `saveSessions`.

## Robustness fix (folded in, same code being touched)

`ensureSeeded()`'s three `dbPut` calls (for `programmes_list`,
`programme_a_sessions`, `programme_b_sessions`) currently have no
verification that the write actually persisted. This is being rewritten
for the migration anyway, so each write gets an immediate read-back
check; if a write doesn't verify, retry once, then throw (surfacing via
`app.js`'s existing `try/catch` "Failed to start" error card) rather than
silently leaving the app in a partially-seeded state. This doesn't
necessarily explain the user's current on-device issue, but removes one
possible silent-failure mode while this exact code is already being
touched.

## Testing / verification plan

No automated test framework exists in this project — verification is
manual, per existing project convention:
- `node --input-type=module < file.js` syntax checks on every touched file.
- Live browser testing via `vercel dev` + Playwright:
  1. Seed a synthetic account with A/B already in the OLD single-week
     shape (simulating an existing user pre-migration), load the app,
     confirm Today's Week 2/3/4 content for both programmes is visually
     identical to what the pre-migration code produces (same sets, same
     hold times, same notes) — this is the critical no-regression check.
  2. Confirm the migrated data is actually persisted in the new shape on
     a second reload (no re-migration, no data drift).
  3. In the block editor, switch between W1-W4 for Programme A, confirm
     each week's blocks are independently editable and saves don't bleed
     into other weeks.
  4. Create a new custom programme, confirm all 4 weeks start as
     identical empty rest days, edit Week 3 only, confirm Weeks 1/2/4
     remain untouched.
  5. Upload an old-format (no `weeks` key) advanced JSON file, confirm all
     4 weeks come back identical (flat-copy behavior).
  6. Upload a new-format (`weeks` key present) advanced JSON file with
     genuinely different content per week, confirm each week's Today
     render shows the correct distinct content.
  7. Fresh install (no existing data): confirm A/B seed directly in the
     new shape with no migration step involved.
  8. **Regression check for the "prev" reference feature** (the user's
     original secondary complaint, unrelated in cause but worth confirming
     unaffected): seed synthetic `today-log` workout history with explicit
     `programme`/`week`/`day` fields, migrate that programme from old to
     new shape, then confirm the Today tab's "prev" column still shows the
     correct prior session for the matching programme+week+day — not just
     "no changes were made to getPrevExercise" as a code claim, but an
     actual before/after render check.
