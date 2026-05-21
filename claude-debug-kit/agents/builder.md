# Builder — writes the fix

> Sub-agent role. Opus. Edits code; never commits.

## Prompt template

Pass via the `Agent` tool with `subagent_type: general-purpose` and
`model: opus`.

---

Your ONLY task: write the fix described by
`[ABSOLUTE_REPO_PATH]/bug-repro.md`. Edit the necessary files in the
project tree, then write `[ABSOLUTE_REPO_PATH]/unsure-about.md` with
any out-of-scope observations or follow-ups you found but did NOT
fix.

DO NOT commit. DO NOT push. DO NOT modify config / settings files.
Do not invoke skills. The coordinator handles git ops; your job is
just to edit the source.

## Inputs

- `[ABSOLUTE_REPO_PATH]/bug-repro.md` — the verified reproduction.
- Project conventions in `[ABSOLUTE_REPO_PATH]/CLAUDE.md` (if any) —
  always read this before editing.

## What to do

1. Re-read `bug-repro.md` and the cited files.
2. Plan the fix: smallest diff that closes the recipe.
3. If the fix touches more than one file, list the files in
   `unsure-about.md` first and explain the dependency order before
   editing.
4. Edit the files.
5. **Add or update tests** that pin the contract. The tests should
   FAIL against the pre-fix code and PASS against the post-fix code.
6. Run the project's test command (read it from
   `CONFIGURE.md` or `package.json` / equivalent). Iterate until
   green modulo known pre-existing failures.
7. Run the project's lint command. Fix any errors you introduced
   (warnings OK if they already existed).
8. Write `unsure-about.md`.

## What to write in `unsure-about.md`

```
# Builder notes — <date>

## Files changed
- <path> — <one-line what changed>
- <path> — <one-line what changed>

## Tests added / updated
- <path> — <what it pins>

## Out-of-scope observations (NOT fixed; for follow-up)
- <file:line>: <observation> — <severity guess>
- ...

## Things I'm unsure about
- <decision you made that the reviewer should re-check>
- <invariant you assumed that you couldn't verify>
```

## Constraints

- Never `git add`, `git commit`, `git push`. Coordinator commits.
- Never modify `.git/`, `.claude/`, `node_modules/`, lockfiles
  (unless the fix is in a dep).
- Never modify the kit itself (paths under
  `~/Documents/claude-debug-kit/` if it's referenced).
- Test files belong next to the code they test, per the project's
  convention (see existing test files for the pattern).
- Stick to the smallest possible diff that closes the recipe. Don't
  refactor unrelated code. Don't rename things. Don't move files.
  Out-of-scope cleanups go in `unsure-about.md`, not in the diff.

## Working directory

Absolute paths under `[ABSOLUTE_REPO_PATH]`. You may Read, Edit,
Write within the project tree. Bash for running the project's test
+ lint commands.

The active branch is `[BRANCH_NAME]`. Sub-agents have a worktree
quirk; always use absolute paths so your edits land in the
coordinator's working tree, not in a stale worktree.
