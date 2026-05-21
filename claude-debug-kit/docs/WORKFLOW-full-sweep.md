# Workflow — full-sweep audit

Use this when the user asks for a comprehensive review of a codebase
("do another sweep", "what bugs are we missing", "audit this repo
before launch", etc.).

## Shape

Four parallel auditors, each writing to a separate output file. The
coordinator triages their findings, prioritises, then ships fixes via
the single-bug workflow.

```
Coordinator ─┬─→ Surveyor          (Sonnet) → audit-YYYY-MM-DD/survey.md
             ├─→ Security Auditor  (Opus)   → audit-YYYY-MM-DD/security.md
             ├─→ Quality Auditor   (Sonnet) → audit-YYYY-MM-DD/quality.md
             └─→ Regression Auditor(Opus)   → audit-YYYY-MM-DD/regression.md
                                              ↓
                                          triage
                                              ↓
                                  ship fixes (one PR per bug or bundle)
```

## Phase 1 — Prepare

1. Sync the repo to latest master / main:
   ```
   git fetch upstream && git checkout master && git pull --ff-only
   ```
2. Create the output dir:
   ```
   mkdir -p audit-$(date +%Y-%m-%d)
   ```
3. Confirm `.git/info/exclude` has `audit-*/` (see RULES rule 9).

## Phase 2 — Launch the four auditors in parallel

In **a single coordinator message**, fire all four `Agent` tool calls
so they execute concurrently. Each gets the anti-derailment header +
its role prompt from `agents/`.

Approximate output files:

| Agent | File | Focus |
|---|---|---|
| Surveyor | `audit-YYYY-MM-DD/survey.md` | General bug enumeration, prioritise new code. |
| Security Auditor | `audit-YYYY-MM-DD/security.md` | XSS / SSRF / RLS / auth-bypass / CSRF / secrets / open-redirect. |
| Quality Auditor | `audit-YYYY-MM-DD/quality.md` | Perf, resilience, a11y, copy. |
| Regression Auditor | `audit-YYYY-MM-DD/regression.md` | Cross-check the N most-recently merged PRs for unintended consequences. |

See `agents/{surveyor,security-auditor,quality-auditor,regression-auditor}.md`
for the full per-agent prompt templates.

While they run, the coordinator can do prep work (re-read project
`CLAUDE.md`, sync any prior `findings.md`).

## Phase 3 — Triage

When all four return, read each output file. Build a triage table:

```
| # | Finding | Severity | Class | Bundle? | Site |
|---|---|---|---|---|---|
| SEC-1 | <one-liner> | Critical | data-destruction | standalone | <file> |
| SEC-2 | <one-liner> | High | priv-escalation | standalone | <file> |
| S-1, C-1 | currency hardcode (2 sites) | High | data-correctness | bundle | <files> |
| R-3 | Promise.all blast radius | Medium | resilience | standalone | <file> |
...
```

Bundling rules:

- Same root cause across multiple files → bundle into one PR.
- Same lens (security / perf) but different root causes → separate PRs.
- Critical / urgent → standalone, shipped first.
- Defence-in-depth Lows → bundle into one "hardening" PR.

## Phase 4 — Surface to user, then ship

Present the triage to the user in plain English:

> "Found 1 Critical, 2 High, 5 Medium, 8 Low. Critical is X (one cron
> away from data loss). Recommend shipping in this order: …"

Per the standing autonomy directive (if active), proceed without
asking — just start at the top of the prioritised list. Critical and
High items go first, no exceptions.

For each item, run `WORKFLOW-bug-fix.md`. You can chain them — one
sweep typically produces 5-15 PRs.

## Phase 5 — Update memory + close

After the last fix ships:

1. Update `findings.md` with any cross-cutting observations the
   auditors flagged but you didn't fix (deliberate deferrals).
2. Update the project's `.coordinator-state.md` with new constraints
   you learned (e.g. "the foo helper is restricted by ESLint config").
3. Surface to user: "shipped N fixes (X merged, Y drafts). Remaining
   audit items: <short list>. Recommend next session focus on Z."

## Notes on running parallel

- Sub-agents have independent context. They do not share state. The
  coordinator is the only place context aggregates.
- Each agent's `Bash` tool is independent — they can grep + git log
  in parallel without conflict.
- If one agent finishes much faster than the others (Surveyor often
  finishes in 5 min while Security takes 15+), do NOT start fixing
  while others are still running. You may miss interactions.
- If an agent runs much longer than expected (>30 min), check its
  output file directly via Read — sometimes the tool's completion
  signal lags but the work is done.

## False positive handling

When triaging, mark items as **false-positive** if you can verify
they're not bugs (see RULES rule 5). Document the reasoning in your
triage table — the user may want to know what was checked-and-cleared
vs. what's still open.
