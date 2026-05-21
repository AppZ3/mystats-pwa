# Methodology

## The problem this solves

A solo coordinator using Claude Code on a real codebase hits three
recurring failure modes:

1. **Cold-read contamination.** When the coordinator drafts the
   technical analysis themselves, sub-agents inherit their framing
   and lose the independent perspective that catches missed defects.
2. **Single-pass blindness.** A single Builder agent writing both the
   fix and its tests will sometimes assert against the buggy value
   it's supposed to be preventing. Without an adversarial gate, this
   ships green.
3. **Scope creep + drift.** Long sessions accumulate untracked side
   artifacts (findings, audit dirs, half-done refactors), and a
   careless `git add -A` ends up shipping them.

## The shape of the solution

A **coordinator** (the main Claude session) orchestrates **sub-agents**
spawned through the `Agent` tool. Each sub-agent has a single,
narrow role and writes its output to a named file in the project root.
The coordinator reads those files and gates progress.

```
                            ┌─────────────────┐
                            │   Coordinator   │
                            │  (you, in this  │
                            │  Claude session)│
                            └────────┬────────┘
                                     │
            ┌────────────────────────┼────────────────────────┐
            │                        │                        │
       ┌────▼─────┐            ┌─────▼─────┐            ┌────▼─────┐
       │ Explorer │            │  Builder  │            │ Reviewer │
       │  (Sonnet)│            │   (Opus)  │            │  (Opus)  │
       └────┬─────┘            └─────┬─────┘            └────┬─────┘
            │                        │                       │
       bug-repro.md            <writes the fix>          review.md
       verification.md          (no commit)
```

Plus, for sweep-level work, four read-only auditors that run in parallel:

```
┌──────────┐  ┌──────────────────┐  ┌─────────────────┐  ┌──────────────┐
│ Surveyor │  │ Security Auditor │  │ Quality Auditor │  │  Regression  │
│ (Sonnet) │  │     (Opus)       │  │    (Sonnet)     │  │    Auditor   │
└────┬─────┘  └────────┬─────────┘  └────────┬────────┘  │    (Opus)    │
     │                 │                     │           └──────┬───────┘
survey.md       security.md            quality.md         regression.md
```

The coordinator triages findings across the four output files,
prioritises, and ships fixes via the Builder/Reviewer flow.

## Why files, not in-context messages

Three reasons:

1. **Context budget.** A 200-line audit dropped into the
   coordinator's window costs more than reading the file lazily when
   triaging.
2. **User visibility.** The user can read the same files at any time
   — no hidden state.
3. **Cross-session continuity.** A new Claude session in the same
   project can read the files and pick up where the previous session
   left off.

## Why Opus / Sonnet split

| Model | Where | Why |
|---|---|---|
| Opus | Builder, Reviewer, Security Auditor | Highest-stakes work. Adversarial review especially benefits from larger reasoning capacity. |
| Sonnet | Surveyor, Explorer, Quality Auditor, Regression Auditor | Methodical code-reading, classification, fact-finding. Cheaper, fast enough. |
| Haiku / direct Bash | Trivial lookups (file existence, single-grep counts) | Cheapest tier. |

Cost-aware sessions favour Sonnet where it suffices and reserve Opus
for the load-bearing roles. Always pass `model:` to the `Agent` tool
explicitly so the choice is auditable.

## Why agent-consensus, not coordinator-judges

If the coordinator decides whether to ship, the coordinator's
biases (recency, anchoring, fatigue) determine ship/iterate. By
deferring to the agreement of two independent agents (Reviewer +
Explorer Mode-2), the coordinator becomes a tie-breaker, not the
primary judge.

The user sits one level up — they own scope choices ("fix the wider
bug class or the narrow site?"), but rarely have to read diffs.

## What you avoid

- **No "Sentinel" / human-checkpoint cold-reads.** The Allwis pilot
  tried this and it produced contaminated checkpoints. Replaced with
  agent-consensus.
- **No long-running shared chat between sub-agents.** Each agent
  starts cold from its prompt + the project tree. No conversational
  state between them.
- **No coordinator-as-developer.** The coordinator reads, decides,
  commits, pushes. It doesn't write the fix; the Builder does.

## Where this falls short

- **Schema / migration work** is still a coordinator task. Sub-agents
  struggle with multi-file ordered SQL edits.
- **UI changes** need a human eye. The coordinator can wire up a
  browser test scaffold but ultimately you should run the dev server
  and look at the result.
- **External-API integrations** require credentials the coordinator
  doesn't have. The Builder writes the code; the maintainer wires the
  secrets.
