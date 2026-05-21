# Pull request description template

> Used by the coordinator when running `gh pr create`. Trim sections
> that don't apply.

```markdown
## TL;DR

<2-3 sentences. Lead with severity if this is a security fix or an
urgent bug. The maintainer reads only this section before deciding
whether to drop in for a deeper review now or later — make it earn
that decision.>

## Threat model / Impact

Only if security or critical. Otherwise delete this section.

- **Who exploits this**: <attacker role + precondition>
- **What they get**: <data accessed, write capability, etc.>
- **Who's harmed**: <user role + blast radius>
- **Reachability**: <adversarial / incidental / both>

## What changed

| File | Change |
|---|---|
| `<path>` | <one-line> |
| `<path>` | <one-line> |

Reference a key helper or pattern by name so the maintainer can grep
to find it.

## Tests

What new tests pin:

- `<test-file>`: <N assertions covering X, Y, Z>
- ...

Pre-existing failures: <reference CONFIGURE.md or "none">.

## What <maintainer-name> needs to do

Concrete actions:

1. Review + merge.
2. <only if applicable> Apply migration: `<command>`.
3. <only if applicable> Set env var: `<name>` to `<source>`.
4. <only if applicable> Verify in production: `<short check>`.

If the answer is "just review + merge", say so. Maintainers
appreciate the explicit zero-ops case.

## How it was found

<one line: audit pass / bug report / customer ticket / etc.>

Link to source if available (e.g. another PR, a Sentry alert, an
issue).

## Trade-offs / known limitations

Only if the fix made a non-obvious choice. Examples:

- "Chose to fail-closed in prod rather than warn — alternative was to
  surface a banner; the audit recommended fail-closed and the user
  agreed."
- "Cap of 5_000 rows on the in-memory lookup; tenants beyond that
  fall back to alphabetical-first subset. Documented at the call
  site."

Don't pad with edge cases that aren't real trade-offs.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## Variations

### Bug-fix PR (no security framing)

Drop "Threat model / Impact" entirely. Keep TL;DR, What changed,
Tests, What maintainer needs to do, How it was found.

### Perf PR

Add a "Before / After" measurement table to TL;DR or What changed.
Numbers earn the review.

### Resilience / observability PR

Replace TL;DR's severity framing with "What this stops being silent
about." Maintainers don't need urgency framing for these.

### Refactor or cleanup PR

Add an explicit "No behaviour change" line in TL;DR. The maintainer's
default assumption for refactors is "what did this break"; explicit
no-change framing accelerates the review.

### Bundle PR (multiple findings)

In TL;DR, list each finding with a one-liner. Maintainer can choose
to review each section independently.
