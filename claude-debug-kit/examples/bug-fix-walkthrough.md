# Example — full bug-fix walk-through

Real-shape annotated walkthrough of fixing one bug from user-report
to merged PR. Adapt the placeholders for your project.

## User reports the bug

> "On the bank reconciliation page, every time I refresh, the
> running-balance column shows different values for entries on the
> same date. The total at the bottom is right but the per-row numbers
> shift. I think it's confusing the auditors."

## Coordinator: ack + dispatch Explorer Mode-1

> "Investigating. Spawning Explorer to reproduce + trace the bug."

Tool call:

```
Agent({
  description: "Explorer Mode-1 — repro the running-balance bug",
  subagent_type: "general-purpose",
  model: "sonnet",
  prompt: "[anti-derailment header from rules]
           Your ONLY task: confirm the reported bug exists, document
           reproduction recipe, trace to file:line. Write
           /Users/me/Documents/repo/bug-repro.md.

           The reported bug: 'On reload, running-balance column shows
           different values for same-date entries; total is right but
           per-row numbers shift.'

           Where to start: src/app/reports/account-transactions/ —
           this is the report path. There's probably a sort
           comparator somewhere.

           [rest from agents/explorer.md template]"
})
```

## Mode-1 returns bug-repro.md

```markdown
# Bug repro — 2026-08-15

## Headline of what reproduces
Account-transactions report shows non-deterministic per-row running
balance for journal entries that share an entry_date.

## Reproduction recipe
1. Create 2 manual journals dated the same day on an active account
   (e.g. both 2026-08-15, both posting $100 debits).
2. Open /finance/reports/account-transactions, scope to that account.
3. Note the running-balance column shows row A then row B.
4. Reload the page.
5. The order reverses — running-balance column now shows B then A.

## Root cause trace
- `src/app/.../actions.ts:79`: sort comparator returns `0` for
  same-entry_date pairs.
- JavaScript's Array.sort is not guaranteed stable on engines older
  than V8 12+; even on V8 the inputs aren't guaranteed to come back
  from PostgREST in a stable order.
- The DB ORDER BY clause at line 57 has `created_at` but that's lost
  through the join + serialise.

## Side effects observed
- Per-row balances flip across reloads.
- Final balance is correct (addition commutes).
- Confuses reconciliation against bank statements.

## Test ideas
- Two journals, same date, different created_at: assert the
  comparator sorts by created_at ascending as the tie-breaker.

## Notes for Builder
- Need to also add `created_at` to the SELECT — it's not currently
  in the projected columns.
- Tenant scoping is already correct; don't touch it.
```

## Coordinator: dispatch Builder

> "Repro confirmed. Spawning Builder to write the fix."

Tool call (Opus, with bug-repro.md as input):

```
Agent({
  description: "Builder — fix running-balance ordering",
  subagent_type: "general-purpose",
  model: "opus",
  prompt: "[anti-derailment + builder template from agents/builder.md]

           Inputs:
           /Users/me/Documents/repo/bug-repro.md

           Make the smallest diff that closes the recipe. Add tests.
           Do not commit; coordinator commits."
})
```

## Builder edits + writes unsure-about.md

```markdown
# Builder notes — 2026-08-15

## Files changed
- src/app/.../actions.ts — added `created_at` to SELECT;
  comparator now uses (entry_date asc, created_at asc, id asc)

## Tests added / updated
- src/__tests__/account-transactions-balance.test.ts — 3 assertions:
  same-date entries sort by created_at; different dates still sort by
  date; final balance equals sum.

## Out-of-scope observations
- src/app/.../bank/reconciliation/actions.ts:1812 has the same
  comparator pattern (returns 0 on tie). Logged as M follow-up.

## Things I'm unsure about
- Whether 'id' tiebreak should be alphabetical or numeric — went
  with localeCompare (alphabetical) since ids are UUIDs anyway.
```

## Coordinator: run tests + lint

```bash
cd /Users/me/Documents/repo
npm test 2>&1 | tail -5
# Tests: 1923 pass + 2 pre-existing fails
npm run lint 2>&1 | tail -5
# 0 errors, 3 pre-existing warnings
```

Clean.

## Coordinator: dispatch Mode-2 (blind verify)

> "Builder green. Spawning Mode-2 to verify the recipe is closed."

Tool call (Sonnet, ONLY bug-repro.md as input — does NOT see
unsure-about.md):

```
Agent({
  description: "Explorer Mode-2 — verify running-balance fix",
  subagent_type: "general-purpose",
  model: "sonnet",
  prompt: "[anti-derailment + Mode-2 template from agents/explorer.md]

           Recipe to re-run:
           [paste recipe steps inline from bug-repro.md]

           Write /Users/me/Documents/repo/verification.md.
           DO NOT read unsure-about.md. DO NOT read the diff."
})
```

## Mode-2 returns verification.md

```markdown
# Verification — 2026-08-15

## Recipe re-run
1. Created 2 mock journals same-date, ran the action with different
   sort orders in the input. Pre-fix would have returned different
   row orders. Post-fix returns same order every time.
2. Ran the test suite — new tests pass, no regressions.

## Test runs
- account-transactions-balance.test.ts > "stable order for same-date
  entries": PASS
- account-transactions-balance.test.ts > "tie-break by created_at":
  PASS
- account-transactions-balance.test.ts > "final balance equals sum":
  PASS

## Verdict
**CLOSED**

## What I didn't check
- Performance of the extra column in SELECT (added created_at).
```

## Coordinator: dispatch Reviewer

> "Mode-2 closed. Spawning Reviewer."

Tool call (Opus, sees diff + bug-repro.md + unsure-about.md):

```
Agent({
  description: "Reviewer — adversarial review",
  subagent_type: "general-purpose",
  model: "opus",
  prompt: "[anti-derailment + reviewer template from agents/reviewer.md]

           Diff: git -C /Users/me/Documents/repo diff
                 master..claude/balance-fix-x9k2

           Write /Users/me/Documents/repo/review.md."
})
```

## Reviewer returns review.md

```markdown
# Review — 2026-08-15

## Verdict
**APPROVE** — closes the recipe; tests pin the contract; same-class
follow-up logged.

## Top 3 risks to the maintainer
1. The extra `created_at` in SELECT may add ~50 bytes per row. For
   most accounts <10ms total. Acceptable.
   - Mitigation: documented in commit message.
2. Same comparator pattern exists in bank reconciliation. If
   exploited via the bank screen, same symptom. Logged.
   - Mitigation: follow-up bug REG-7.
3. UUIDs sorted alphabetically may surprise someone expecting
   numeric. UUID v7 sorts naturally by time-prefix when stringified;
   this matches the intent (chronological tie-break).
   - Mitigation: behaviour matches intent; documented in comment.

## Same-class findings outside scope
- src/app/.../bank/reconciliation/actions.ts:1812 — same comparator
  pattern, untouched. Follow-up.

## Test gaps
- No test for the bank/reconciliation site — same bug exists, will
  be addressed by the follow-up.

## Security / RLS / permission concerns
- None found. Checked tenant scoping in actions.ts:53,61 — both
  preserved.

## Maintainer-friendliness
- Commit message: good (one-liner is descriptive)
- Diff bloat: none
- New env vars / migrations: none
- Playbook needed: no

## What I checked
- Read: src/app/.../actions.ts (full file), new test file
- Grepped: `sort\(\(a, b\)` across src/ — found 8 sites; the 2 in
  this file are the only ones with the financial-balance pattern;
  others are alphabetical name sorts and don't have the same
  consequence.
- Verified: the comparator uses localeCompare (Unicode-safe).
```

## Coordinator: agent-consensus says ship

Reviewer = APPROVE. Mode-2 = CLOSED. Per rule 1, ship.

> "Both gates green. Pre-push upstream check then push."

```bash
git fetch upstream
git log master..upstream/master --oneline | head
# (no overlap with our file)
```

Clean. Commit:

```bash
git add src/app/.../actions.ts src/__tests__/account-transactions-balance.test.ts
git diff --cached --stat   # verify only intended files
git commit -m "fix(reports): deterministic running-balance order for same-date entries

[full message per templates/pr-description.md commit section]

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git push -u origin claude/balance-fix-x9k2
```

## Coordinator: open the PR

```bash
gh pr create --repo maintainer/repo \
  --base master \
  --head me:claude/balance-fix-x9k2 \
  --title "fix(reports): deterministic running-balance order for same-date entries" \
  --body "[filled in from templates/pr-description.md]"
```

## Coordinator: archive

```bash
mkdir .bug-archive/12
mv bug-repro.md unsure-about.md verification.md review.md .bug-archive/12/
```

Append the same-class follow-up to `findings.md`:

```
2026-08-15 | Reviewer (bug12) | M | Same comparator pattern in bank/reconciliation/actions.ts:1812 — running-balance non-determinism for same-date entries. Same fix shape as bug #12. | src/app/.../bank/reconciliation/actions.ts:1812
```

## Coordinator: report to user

> "Shipped PR #312 — running-balance fix. Reviewer + Mode-2 agreed,
> archived as bug #12. Same-class pattern flagged in
> bank/reconciliation/actions.ts:1812 — recommend that as the next
> follow-up bug if you want it shipped soon."

End of trace.
