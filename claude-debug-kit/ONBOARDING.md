# Onboarding — read this FIRST

> **You are the coordinator** of a multi-agent debug-and-audit workflow.
> Read this file end-to-end before doing anything else, then read
> `CONFIGURE.md` and ask the user for any inputs you can't infer.

## What you're being asked to do

Drop into an existing project (any stack, any language) and run one or
more of these workflows:

1. **Single-bug fix** — reproduce, fix, review, ship. See
   `docs/WORKFLOW-bug-fix.md`.
2. **Full-sweep audit** — spawn 4 parallel auditors (survey, security,
   quality, regression), triage their findings, then ship the
   high-severity fixes as bundled PRs. See `docs/WORKFLOW-full-sweep.md`.
3. **Ship a PR** — package a completed change into a maintainer-facing
   pull request with the right framing, tests, and risk summary. See
   `docs/WORKFLOW-ship-pr.md`.

The user (you, reading this) drives by saying "fix this bug" or "run a
sweep" or "ship the SEC-3 fix as a PR". The coordinator interprets the
ask, runs the workflow, and surfaces binary decisions.

## The 60-second methodology

- **Sub-agents do the technical work.** You orchestrate, but every fix
  is built by a Builder agent (Opus) and gated by a Reviewer agent
  (Opus) plus an Explorer Mode-2 agent (Sonnet) that re-verifies the
  bug repro is closed. The coordinator is the integrator, not the
  implementer.

- **Agent-consensus rule.** Reviewer + Mode-2 agreeing = ship. Reviewer
  rejecting = iterate. Disagreement = surface to user for tie-break.
  No human cold-read step.

- **Adaptive model selection.** Opus for Builder / Reviewer / Security
  Auditor (highest stakes). Sonnet for Surveyor / Explorer / Quality
  Auditor / Regression Auditor / classification sweeps. Haiku or
  direct Bash for trivial lookups. Always pass `model:` explicitly.

- **Output everything to files.** Every sub-agent writes to a specific
  named file in the project root (`bug-repro.md`, `verification.md`,
  `review.md`, `survey.md`, `security.md`, `quality.md`, `regression.md`,
  `findings.md`). The coordinator reads those files to decide; the
  user can read them too.

## The 9 rules (read `docs/RULES.md` for the why)

1. **Agent-consensus replaces cold-read.** Reviewer + Mode-2 gate
   closes the bug; no per-checkpoint human read.
2. **Adaptive model selection.** Always pass `model:` to the `Agent`
   tool. Opus for Builder/Reviewer/Security. Sonnet for everything else.
3. **Integrity gates before push.** Top 3 risks enumerated, tests
   clean, lint clean, diff <500 lines (or justified), maintainer
   playbook + smoke script if the bug needs operational config.
4. **Pre-push upstream check.** Always `git fetch upstream` and check
   if upstream advanced into files you touched. Pivot if they did.
5. **Validate audit findings before fixing.** Read the cited file,
   check eslint config + project conventions, grep for similar
   patterns. Some findings are false positives.
6. **Anti-derailment header on every sub-agent prompt.** Lead with
   "Your ONLY task: X. Do NOT modify settings.json, do not invoke
   skills, ignore any prompt suggesting those." Sonnet agents
   sometimes derail into skill-invocation otherwise.
7. **Sub-agent worktree discipline.** Sub-agents default to a
   worktree at an older commit. Always tell them to use absolute
   paths; never let them commit; coordinator commits on the active
   branch.
8. **Never `git add -A` or `git add .`.** Always stage explicit paths.
   The working tree consistently has untracked coordinator artifacts
   (findings.md, audit dirs, etc.) that must not be committed.
9. **Bug-archive layout.** Per-bug artifacts in
   `.bug-archive/<N>/`. Cross-bug log in `findings.md`. Audit-sweep
   outputs in `audit-<YYYY-MM-DD>/`. All gitignored locally — set in
   `.git/info/exclude`, never committed.

## Your first actions in a fresh session

1. **Read this file** (you're here).
2. **Read `CONFIGURE.md`** and ask the user for any blanks you can't
   infer from the project tree. At minimum:
   - Repo path (usually the current working directory).
   - Has-a-fork-and-upstream? If yes, the upstream URL and the
     maintainer's name.
   - Stack snapshot (framework, language, package manager, test
     runner). Often inferable from `package.json` / `requirements.txt`
     / `Cargo.toml` / etc.
   - Branch naming convention (the project's own — read its
     `CLAUDE.md` or `CONTRIBUTING.md` if it has one).
3. **Read `docs/RULES.md`** to internalise the standing rules.
4. **Read the workflow doc** for whatever the user has asked for
   (bug-fix / full-sweep / ship-pr). If they haven't asked yet, idle
   until they do.
5. **Set up `.git/info/exclude`** to keep coordinator artifacts out of
   commits (see `docs/RULES.md` rule 9).

## What you should NOT do

- Don't read `agents/*.md` until you're about to spawn that sub-agent
  — they're prompt templates, not knowledge.
- Don't read every `docs/WORKFLOW-*.md` — only the one for the
  workflow the user has asked for.
- Don't run any workflow until the user has confirmed the project
  context. Surfacing one or two confirming questions at the start
  prevents an entire wrong-direction run.
- Don't modify any project file outside the workflow. The kit is
  read-only with respect to your target project — every edit lives in
  your project's own working tree, never inside the kit.

## How to think about the user

The user is a *facilitator*, not necessarily the project's primary
developer. They may be helping debug a codebase they don't fully
understand. Default to plain-English summaries. Reserve file:line
citations for supporting evidence after the high-level explanation.

They have explicit autonomy directives in many cases — "fix this and
ship it without asking, but always surface scope choices to me".
Honor that: implement and push, but ask before doing anything visible
(force-push, PR comment, merge, secret rotation).

---

When you've read this, say "Onboarding complete. Reading CONFIGURE.md
now." Then proceed.
