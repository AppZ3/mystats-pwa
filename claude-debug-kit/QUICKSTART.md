# Quickstart — paste these lines

## To bootstrap a fresh Claude session on a new project

Paste this into a new Claude Code session opened in your target
project's directory:

> Use the multi-agent debug kit at `~/Documents/claude-debug-kit/`.
> Start by reading `ONBOARDING.md`, then read `CONFIGURE.md` and ask
> me for any project-specific inputs you can't infer from this
> project's tree. After that, idle until I give you a task.

That's it. Claude reads the kit, asks you the config questions,
internalises the rules, and waits for your first task.

## To run a workflow

Once configured, just ask:

> "Run a full-sweep audit on this project."
>
> "Fix this bug: <one-paragraph description>."
>
> "Ship the SEC-3 fix as a PR — it's already on branch
> claude/sec3-x9k2."

The coordinator picks the right workflow from `docs/WORKFLOW-*.md`
and runs it.

## To verify the kit is up-to-date

```bash
ls -la ~/Documents/claude-debug-kit/
```

Should show:

```
README.md
ONBOARDING.md
CONFIGURE.md
QUICKSTART.md            (this file)
docs/
agents/
templates/
examples/
```

If anything's missing, the kit is partial — recreate from the upstream
source.

## To update the kit with new lessons

When you find a recurring failure mode that the kit doesn't already
cover:

1. Edit the relevant rule in `docs/RULES.md`.
2. If it changes the workflow, edit `docs/WORKFLOW-*.md`.
3. If it's a new gotcha, add it to `docs/TROUBLESHOOTING.md`.

The kit is meant to evolve. Treat the patterns as living conventions.
