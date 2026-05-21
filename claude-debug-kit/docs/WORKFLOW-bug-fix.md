# Workflow — single bug fix

Use this when the user reports one specific bug, audit finding, or
feature gap. The flow goes: reproduce → fix → review → ship.

## Phase 1 — Repro (Explorer Mode 1, Sonnet)

Spawn an Explorer Mode-1 agent with the anti-derailment header and:

- The bug as the user described it (one paragraph max).
- Where you think it lives (folder hints; the agent grep-locates).
- Instruction to write `bug-repro.md` at the repo root with:
  - The exact reproduction recipe.
  - The file:line trace.
  - Side effects observed (does it persist data wrong? leak a session?).
  - A minimal failing test if testable (or an explanation of why not).

Wait for completion. Read `bug-repro.md`. If the repro is vague or
disagrees with the user's description, surface to user before
proceeding.

## Phase 2 — Build the fix (Builder, Opus)

Spawn a Builder agent with:

- The anti-derailment header.
- `bug-repro.md` as input (absolute path).
- Instruction to **edit files only** — no commits. Coordinator commits.
- Instruction to write `unsure-about.md` with anything the agent
  flagged but didn't fix (out-of-scope observations, future cleanups).
- Reference to project test/lint commands from `CONFIGURE.md`.

Builder writes the diff. Coordinator runs tests + lint and confirms
they're green (modulo known pre-existing failures).

## Phase 3 — Verify (Explorer Mode 2, Sonnet)

Spawn a second Explorer agent in **Mode 2 (blind verify)**. It must
NOT see Builder's notes — only the original `bug-repro.md` and the
current code state. Tasks:

- Re-run the reproduction recipe against the modified code.
- Run any new tests Builder added.
- Write `verification.md` with verdict: **closed** / **still-open** /
  **partial**.

This is the load-bearing "did the fix actually fix it" gate. If
Mode-2 finds the repro still triggers, Builder iterates.

## Phase 4 — Adversarial review (Reviewer, Opus)

Spawn a Reviewer agent with:

- The anti-derailment header.
- `bug-repro.md`, `unsure-about.md`, the diff (via `git diff master..`).
- Instruction to write `review.md` with verdict:
  **approve** / **request-changes**, plus:
  - Top 3 risks to the maintainer.
  - Same-class findings outside the fix scope (always log as
    follow-ups — never expand current scope without user OK).
  - Test gaps (anything not covered).
  - Security / RLS / permission concerns.

Reviewer is adversarial by design — its job is to find what Builder
missed.

## Phase 5 — Decision (agent-consensus rule)

| Reviewer | Mode-2 | Action |
|---|---|---|
| approve | closed | Ship (proceed to phase 6). |
| approve | still-open | Iterate (back to phase 2). |
| request-changes | (any) | Iterate (back to phase 2). |
| disagree on a specific point | (any) | Surface to user. |

If iterating, write the new findings into Builder's next prompt and
loop. Cap at 3 iterations; if you hit 3, surface to user.

## Phase 6 — Ship

Follow `WORKFLOW-ship-pr.md`. Briefly:

1. Pre-push upstream check (rule 4).
2. Commit on the active branch with a message that names the bug +
   verdicts.
3. Push to fork (or origin if no fork).
4. Open PR with the maintainer-facing template from
   `templates/pr-description.md`.

## Phase 7 — Archive

```
mkdir .bug-archive/<N>
mv bug-repro.md unsure-about.md verification.md review.md .bug-archive/<N>/
```

Append any cross-bug findings from `unsure-about.md` to `findings.md`.

## Iteration budget

- Builder iterations per bug: cap at 3. If hit, surface to user with
  a "should we narrow scope or split this into two bugs?" question.
- Per-phase wall clock: typical phase is 2-5 minutes. If a phase runs
  >15 minutes, check the agent's output file for a stalled report
  (sometimes agents finish but the tool didn't return).
