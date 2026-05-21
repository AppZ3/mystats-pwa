# Troubleshooting

## Sub-agent worktree quirks

**Symptom:** sub-agent reports "file not found" for a path you know
exists.

**Cause:** sub-agents default to a worktree at an older commit. Their
relative paths land in `.claude/worktrees/agent-<id>/` rather than
the project tree.

**Fix:** pass absolute paths in every sub-agent prompt
(`/Users/<you>/Documents/<repo>/src/...`).

---

## Sub-agent derails into skill invocation

**Symptom:** Sonnet sub-agent reports it invoked `fewer-permission-prompts`
or `statusline-setup` instead of writing the file you asked for.

**Cause:** Sonnet sometimes pattern-matches the task to a tool/skill.

**Fix:** lead every sub-agent prompt with the anti-derailment header
(rule 6). If it still happens, re-dispatch with a tighter guard:
"Your ONLY task is to write /absolute/path/foo.md. Do NOT invoke any
skill. Do NOT modify any settings file. Re-read this restriction
before writing anything."

---

## `git add -A` slipped untracked files into a commit

**Symptom:** `git show HEAD --name-only` lists files you didn't intend.

**Fix (if not yet pushed):**
```
git reset HEAD~1                    # un-commit
git restore --staged <bad-file>     # un-stage
git add <intended-files>            # stage explicitly
git diff --cached --stat            # verify
git commit -m "..."
```

**Fix (if already pushed):** same as above + `git push --force-with-lease`.

**Prevention:** rule 8 + augment `.git/info/exclude` with patterns
for known coordinator artifacts.

---

## Audit finding is a false positive

**Symptom:** you apply the recommended fix, lint or tests fail.

**Cause:** the audit didn't read `eslint.config.*`, `tsconfig.json`,
or `CLAUDE.md` carefully enough.

**Fix:** revert the change, document the false-positive in the PR
description for the OTHER findings you ARE shipping, so the reasoning
lives somewhere reviewable.

**Prevention:** rule 5. Read the cited file + line yourself. Check
for project conventions before fixing.

---

## Reviewer + Mode-2 disagree

**Symptom:** Reviewer approves but Mode-2 says repro still triggers,
or vice versa.

**Cause:** Reviewer may be reading the diff against an idealised
spec, while Mode-2 is running the actual reproduction recipe. Usually
Mode-2 is more reliable for "did the fix work" — Reviewer is more
reliable for "is this safe to ship".

**Fix:** if Mode-2 says still-open, ITERATE. If Reviewer says
request-changes, also iterate. Only ship when both agree (rule 1).

---

## Sub-agent runs past expected time

**Symptom:** Surveyor is still running after 20 minutes when you
expected 10.

**Cause:** large codebases (>500 source files) take longer for
methodical scans.

**Fix:** check the output file directly. The agent often finishes its
write but the tool's completion signal hasn't returned yet. If you
see the file populated with sensible content, treat it as done.

**Don't:** poll repeatedly. The harness will notify you when the
agent finishes. Polling burns context.

---

## "Maintainer" doesn't apply (personal project, no fork)

**Symptom:** the kit's PR template + integrity gates assume a separate
upstream / maintainer.

**Fix:** in `CONFIGURE.md`, set `Fork setup? = no`. Workflows then
skip rule 4 (pre-push upstream check) and the PR template's
maintainer sections become self-review notes for the user.

---

## Project has its own conventions that conflict with the kit

**Symptom:** project's `CLAUDE.md` / `CONTRIBUTING.md` says one thing,
the kit says another.

**Fix:** **project conventions always win.** The kit's rules are
generalised defaults. If the project's branch-naming, commit style,
or test command differs, defer to the project — and update the
project's `.coordinator-state.md` so future sessions pick it up.

---

## Tests fail on master (pre-existing)

**Symptom:** `npm test` (or equivalent) reports 2-3 failures even on a
clean checkout.

**Fix:** record them in `CONFIGURE.md` § "Known pre-existing test
failures". The integrity gates check is "no NEW failures introduced",
not "0 failures total".

---

## Memory file says X but the codebase has Y

**Symptom:** persistent memory ([[project-memory-key]]) references a
file or function that no longer exists.

**Cause:** memory snapshot is stale. The codebase moved on.

**Fix:** trust the codebase, not the memory. Update or remove the
stale memory entry. Don't act on the memory without verifying first.

---

## Force-push warning

If you ever need to force-push:

- Use `git push --force-with-lease`, never `git push --force`.
- Never force-push to `master` / `main` / `develop` — surface to user
  first.
- Force-pushing your own feature branch after a clean rebase or after
  fixing a `git add -A` slip is fine.
