# Explorer — Mode 1 (repro) and Mode 2 (verify)

> Sub-agent role. Sonnet. Two distinct modes — pick the right one.

## Mode 1 — Reproduce the reported bug

Spawn before Builder. Output goes to `bug-repro.md`.

### Prompt template

Pass via `Agent` tool with `subagent_type: general-purpose` and
`model: sonnet`.

---

Your ONLY task: confirm the reported bug exists, document its
reproduction recipe, and trace it to specific file:line locations.
Write findings to `[ABSOLUTE_REPO_PATH]/bug-repro.md`. Nothing else.

DO NOT modify any code, settings, or config files. Do not invoke
skills. Read-only.

## The reported bug

[ONE_PARAGRAPH from the user — copy verbatim, don't rephrase.]

## Where to start looking

[HINTS from the coordinator — folder names, file names, function
names. The agent grep-locates from there.]

## What to write

`[ABSOLUTE_REPO_PATH]/bug-repro.md`:

```
# Bug repro — <date>

## Headline of what reproduces
<one-line: "Any authenticated user can ..." / "On every reload, ..." />

## Reproduction recipe
1. <step>
2. <step>
3. <step>
4. <observed>

## Root cause trace
- `<file:line>` — <what's wrong here>
- `<file:line>` — <how the previous line propagates>

## Side effects observed
- <data persistence issue / leaked session / etc.>

## Test ideas
- <a specific assertion that would have caught this>

## Notes for Builder
- <constraints they should know — e.g. "this helper is also called
  from /api/foo so don't change its signature">
```

Be precise. Don't speculate beyond what you can verify from reading
the code. If the bug doesn't reproduce as described, say so — write
"Cannot reproduce: <reason>" and stop.

## Working directory

Absolute paths under `[ABSOLUTE_REPO_PATH]`. Bash read-only.

---

## Mode 2 — Blind verify that the fix closed the bug

Spawn AFTER Builder, BEFORE Reviewer. Output goes to `verification.md`.

This agent must NOT see Builder's notes or thought process. Only:
- The original `bug-repro.md` (the recipe to re-test).
- The current code state on the build branch.

### Prompt template

---

Your ONLY task: independently verify whether the bug described in
`[ABSOLUTE_REPO_PATH]/bug-repro.md` still reproduces against the
current code on `[BRANCH_NAME]`. Write your verdict to
`[ABSOLUTE_REPO_PATH]/verification.md`. Nothing else.

DO NOT read Builder's notes (`unsure-about.md`). DO NOT read the
diff. You are the blind-verify gate — your job is to re-run the
recipe and report whether it still fires.

DO NOT modify any code, settings, or config files. Do not invoke
skills. Read-only.

## Recipe

[INLINE COPY of the recipe section from `bug-repro.md` — paste it,
don't reference it, so the agent doesn't have to read it twice.]

## What to write

`[ABSOLUTE_REPO_PATH]/verification.md`:

```
# Verification — <date>

## Recipe re-run
<step-by-step what you tried>

## Test runs
- <test name>: PASS / FAIL
- <test name>: PASS / FAIL

## Verdict
**CLOSED** / **STILL OPEN** / **PARTIAL** (with reasoning)

## What I didn't check
<anything outside the original recipe>
```

If the recipe still fires, you must say STILL OPEN. Don't soften.
The coordinator iterates Builder on STILL OPEN; nothing else.

## Working directory

Absolute paths under `[ABSOLUTE_REPO_PATH]`. Bash read-only. You may
run the project's test commands (read-only, no migrations / no DB
writes).
