# Workflow — ship a PR

Use this when you have a completed change ready for the maintainer.
Output is a clean commit + push + PR with the maintainer-facing
framing they expect.

## Phase 1 — Pre-flight (integrity gates, rule 3)

Re-run the gates:

1. Tests pass (modulo known pre-existing failures from `CONFIGURE.md`).
2. Lint clean.
3. Type check clean if relevant.
4. Diff is reviewable (<500 lines or justified in the commit body).
5. Project's `CLAUDE.md` / `CONTRIBUTING.md` re-read against the diff.
6. Maintainer playbook in `docs/` if the bug needs operational config.
7. Smoke script in `scripts/` paired with the playbook.

Any gate failing = fix or pivot before pushing.

## Phase 2 — Pre-push upstream check (fork projects only, rule 4)

```
git fetch upstream
git log master..upstream/master --oneline
```

If anything's there, check overlap:

```
git diff --name-only master..HEAD          # your changes
git log master..upstream/master --name-only # their changes
```

If overlap, pivot per rule 4.

## Phase 3 — Stage explicitly (rule 8)

NEVER:

```
git add -A    # NO
git add .     # NO
```

DO:

```
git add path/to/file1 path/to/file2 path/to/file3
git diff --cached --stat   # verify only intended files staged
```

If you have many files (>10), build the list explicitly:

```
git diff --name-only | grep -v "^audit-\|^findings.md\|^.bug-archive" | xargs git add
```

## Phase 4 — Commit

Use a single commit per logical change. Commit message structure:

```
<type>(<scope>): <subject> (<finding-ids>)

<paragraph: what the bug was, in plain language>

<paragraph: what the fix does, in plain language>

<paragraph: tests added — what they pin>

<closing: deferrals, known limitations, links to related items>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Subject line conventions follow the project's commit-style preference
(typically conventional-commits: `fix:`, `feat:`, `perf:`, `chore:`).

## Phase 5 — Push

For a fork-with-upstream project:

```
git push -u origin <branch-name>
```

For a personal repo:

```
git push -u origin <branch-name>
```

Per the user's standing autonomy directive (if active), push without
re-confirming after a clean integrity-gates pass. User can override
with "wait" / "stop".

## Phase 6 — Open the PR

Use `gh pr create --repo <upstream-or-origin> --base master --head <user>:<branch>`
with the maintainer-facing template from `templates/pr-description.md`.

The template structure is:

```markdown
## TL;DR

<2-3 sentence plain-English summary. Lead with severity if security.>

## Threat model / Impact (only if security/critical)

<who exploits this, what they get, who's harmed>

## What changed

<bullet list of files + what changed in each>

## Tests

<what new tests pin; reference pre-existing failures from CONFIGURE.md>

## What <maintainer> needs to do

<concrete actions: review + merge / apply migration / set env var>

## How it was found

<one line: audit, bug report, etc. Link to source if available.>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## Phase 7 — Surface to user

Report PR URL + one-sentence summary. If the PR depends on prior PRs
being merged (e.g. the layout fix and the perf fix both touch the
same file), call it out so the user can sequence with the maintainer.

## Common gotchas

### `git add -A` slipped in
Already happened twice in pilot. Recovery:
```
git reset HEAD~1                 # un-commit, keep changes staged
git restore --staged <bad-file>  # un-stage the unwanted file
git diff --cached --stat         # verify
git commit -m "..."              # re-commit cleanly
git push --force-with-lease      # if already pushed
```

### Force-push needed (clean recovery only)
Use `--force-with-lease`, never raw `--force`. The lease checks the
remote hasn't advanced since your last fetch — protects against
overwriting parallel work.

### PR template too long
Maintainers reading 30 PRs that day skim. Keep the TL;DR to 2-3
sentences. Detail goes in the body. If the change is large enough to
need 5+ sections, the change should probably be split.

### Maintainer asks for changes
Address in a follow-up commit on the same branch. Don't squash
yourself — the maintainer's squash-merge will collapse history on
merge. Push the new commit, comment on the PR with a brief "addressed
X — please re-look at <file>".
