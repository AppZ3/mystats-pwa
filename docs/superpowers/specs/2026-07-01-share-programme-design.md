# Share a Programme — Design

**Status:** Approved, not yet planned/implemented. Queued behind the in-progress multi-programme-support work (same worktree/branch currently finishing up) — this feature builds directly on top of `js/programme-editor.js`'s programme manager and upload logic, both of which are mid-flight there.

## Problem

You want to hand a programme you've built (or uploaded) to a friend, so they can train off the same structure on their own copy of the app — with their own profile, their own logged weights, their own pace. There's no way to get a programme's content out of your device today.

## Goals

- Export any programme (built-in or your own) as a downloadable JSON file, from the programme manager in Settings.
- The friend imports it into their own separate instance of the app (their own device/browser, their own IndexedDB, their own onboarding/profile) using the **existing** "Upload Programme" flow — no new import code.
- No numeric tailoring to the recipient's body stats. Confirmed with the user: a programme never stores a target weight in the first place (weight is always logged live, per session, by whoever's training) — the only thing that transfers is the programme's structure (days, blocks, sets/reps/hold-time/cardio targets), and that transfers as-is, unchanged, regardless of who imports it.

## Non-goals

- No account system, no server-side storage or sharing link, no relay of any kind. Sharing means "here's a file" — how it physically reaches the friend (email, messaging app, cloud drive) is entirely outside the app's concern.
- No per-recipient scaling of any value (reps, sets, hold times, cardio BPM zones, anything). The user explicitly confirmed they just want the friend to set up their own profile normally and have the shared programme available to train from — not a personalized/rescaled copy.
- No changes to the upload/import code path at all. `js/programme-editor.js`'s `importJsonProgramme` (built in the concurrent multi-programme-support work) already accepts a full `{name, description, days: {DayName: {label, focus, blocks}}}` shape and uses a day's `blocks` array verbatim when present — this is exactly the shape a shared-programme export needs to produce. No new parsing logic.

## Design

**New button, one per programme row**, in `js/programme-editor.js`'s `progMgrRow(p)` (alongside the existing Rename/Edit/Delete buttons): `⬇ Share`.

**Export logic** (new function, e.g. `exportProgramme(id)` in `js/programme-editor.js`):
1. Read the programme's meta (`name`) via `getProgrammeMeta(id)` and its sessions via `getSessions(id)` (both already exported by `js/programmes.js`).
2. Convert the sessions object (keyed `0`-`6`, Sunday-Saturday, per `js/programmes.js`) into the upload format's day-name keys (`Sunday`-`Saturday`) — the inverse of `PROG_DAY_MAP` already defined in `js/programme-editor.js` for the import side; a small reverse-lookup table, not new logic.
3. Build `{ name: meta.name, description: meta.description || '', days: { <DayName>: { label, focus, blocks } for each day } }`.
4. Serialize with `JSON.stringify(..., null, 2)`, trigger a download named after the programme (slugified name, e.g. `mystats-programme-deload-week.json`) — same `Blob`/`URL.createObjectURL`/`a.click()` pattern already used by the existing "⬇ Template" download button.

**No changes needed on the import side.** A friend receiving this file uses the programme manager's existing "📋 Upload Programme" button (built in the concurrent work) exactly as it stands today — the file's shape is already what `importJsonProgramme`'s advanced (`blocks`-array) branch expects.

## Data flow

```
Programme owner (Settings → Programmes → row → ⬇ Share)
  → getProgrammeMeta(id) + getSessions(id)
  → day-number → day-name conversion
  → JSON file download

                     (file transferred by any means outside the app)

Friend, own device (Settings → Programmes → + Add Programme → Upload Programme)
  → existing importJsonProgramme(file, newProgId)
  → Array.isArray(dayData.blocks) branch used verbatim
  → friend's own programme, full fidelity, their own profile untouched
```

## Edge cases

- **Rest days** (empty `blocks: []`): serialize and re-import cleanly — the existing upload code already handles an empty/absent `exercises`/`blocks` array as a Rest day with no special-casing needed.
- **Programme name collisions** on the friend's side: not a concern — `createProgramme`/the upload flow already assigns a fresh, independent id (lowest free letter) on their device; names don't need to be unique across two separate app instances.
- **Re-sharing an already-imported programme**: works the same way — export doesn't care whether the programme was originally built-in, hand-built, or itself imported.

## Testing approach

No automated test framework exists in this repo. Manual verification: export a programme with at least one of every block type (warmup/skill/strength/core/circuit/cardio/mobility) plus one Rest day, inspect the downloaded JSON for correct day-name keys and verbatim block content, then re-upload that same file into a **different** programme slot in the same app instance (simulating "a friend importing it") and confirm the new programme's block builder shows identical content to the original.
