# findings.md format

`findings.md` is the persistent, cross-bug, untracked log of
out-of-scope observations a Builder / Reviewer / Auditor flagged but
chose not to fix in the current diff. It lives at the repo root
(gitignored locally).

## Header (once, top of file)

```
# Findings — running log of out-of-scope observations

Entries follow the format:
`YYYY-MM-DD | <agent> | <severity H/M/L> | <one-line description> | <file:line>`

One line per finding. Detail goes in the agent's primary output
artifact (review.md, security.md, etc.) — `findings.md` is just the
cross-bug index.

---
```

## Entry format

One line per finding. Pipe-delimited fields:

```
YYYY-MM-DD | <agent name> | <H/M/L> | <one-line description> | <file:line>
```

- **date**: when the finding was logged (NOT necessarily when it was
  introduced).
- **agent**: who flagged it. Examples: `Surveyor`, `Reviewer (bug3)`,
  `Builder (bug12)`, `playbook`, `process`, `setup`.
- **severity**: H (will bite users), M (likely to bite eventually),
  L (minor / latent / hygiene).
- **description**: ONE sentence. If you need two, restructure.
- **file:line**: pinpoint. If multi-site, name the most representative.

## Example entries

```
2026-05-17 | setup | M | 2 tests fail on master: `tokens-roundtrip.test.ts` mock only wires `api_tokens`, but middleware now queries `tenant_settings` too (added in #226 MFA enforcement). | src/__tests__/api/tokens-roundtrip.test.ts:74
2026-05-18 | Reviewer (bug3) | H | Notification bell click handler assigns `notif.link_url` to `window.location.href` with no scheme check — fed by briefing fan-out that copies AI-emitted `item.link_url` verbatim. Same class as audit #3. | src/components/notifications/NotificationBell.tsx:137
2026-05-19 | Surveyor | L | `bank/actions.ts` reconciliation rule-saving catch is empty — categorisation failures invisible (no Sentry). | src/app/(dashboard)/finance/bank/actions.ts:1767
2026-05-20 | perf-walk (post-merge) | H | Re-walk shows TTFB 2945→2646ms (~10%, -299ms). Investigation predicted 450-1100ms. Code-only PRs largely exhausted; next unlock needs infra (edge runtime + Supabase batching + static chrome caching). | ux-eval/out/perf-comparison-postPR269.md
```

## Severity heuristics

| Severity | Meaning | Examples |
|---|---|---|
| H | Will bite users without dedicated work | XSS open in a different code path; missing tenant scope on a DELETE; data destruction on next cron |
| M | Will bite eventually; user impact when it does | N+1 query; missing Sentry on an error swallow; non-deterministic ordering |
| L | Hygiene / dev experience / cosmetic | Empty catch on dead code path; docstring drift; test file naming |

## Rules

- One entry per line. Never wrap.
- Reverse-chronological order is fine but not required; the
  date-prefix makes any order navigable.
- When a finding is later FIXED in a separate PR, do NOT remove the
  entry — append a status:
  ```
  2026-05-17 | Surveyor | M | useAutosave cleanup useEffect cancels the pending debounce timer on unmount but never flushes — last <=10s of edits lost when user navigates away. | src/hooks/useAutosave.ts:54
  → CLOSED 2026-05-19 by PR #295.
  ```
- Findings are work surface, not specification. Don't lock the team
  into fixing every L; the file is a memory aid, not a contract.
