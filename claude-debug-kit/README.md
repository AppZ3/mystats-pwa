# claude-debug-kit

A portable multi-agent debugging + audit kit for Claude Code. Drop it
into any project — apps, websites, libraries — and a fresh Claude
session understands the methodology, roles, rules, and artifacts well
enough to start working immediately.

## What this is

The kit packages a workflow proven across a multi-week run on a real
SaaS codebase: parallel sub-agents handle survey / security / quality
/ regression lenses; a coordinator interprets their outputs and gates
shipping; standing rules prevent the common failure modes (timer
leaks via missing cleanup, audit findings that conflict with project
ESLint rules, accidental `git add -A` commits, etc.).

## What this is NOT

- It is not a one-click "fix my codebase" tool. The coordinator still
  has to make judgment calls and surface trade-offs to you.
- It is not specific to any stack — there's no Next.js / Supabase /
  Trigger.dev assumption hard-coded into the rules. Stack-specific
  config goes in `CONFIGURE.md` (which you fill in once per project).
- It is not a replacement for human review. Maintainer-facing PR
  summaries are part of every workflow; the coordinator never merges.

## How to use it

1. Clone this directory anywhere on your machine. Common path:
   `~/Documents/claude-debug-kit/`.
2. Open a fresh Claude Code session in your target project's directory.
3. Tell Claude: *"Use the kit at `~/Documents/claude-debug-kit/`.
   Start by reading `ONBOARDING.md`, then ask me for the per-project
   configuration."*
4. Claude reads `ONBOARDING.md`, prompts you for the project-specific
   inputs in `CONFIGURE.md` (repo path, maintainer name, fork URL if
   any, stack snapshot), and from there can run any of the workflows:

   - **Single bug fix** — `docs/WORKFLOW-bug-fix.md`
   - **Full-sweep audit** — `docs/WORKFLOW-full-sweep.md`
   - **Ship a PR** — `docs/WORKFLOW-ship-pr.md`

## File map

| Path | Purpose |
|---|---|
| `ONBOARDING.md` | First-read for a fresh Claude session. The entry point. |
| `CONFIGURE.md` | Per-project fill-in-the-blanks (repo, maintainer, stack). |
| `docs/METHODOLOGY.md` | Why this exists. Multi-agent overview. |
| `docs/RULES.md` | The 9 standing rules every workflow obeys. |
| `docs/WORKFLOW-*.md` | Step-by-step recipes for each workflow type. |
| `docs/TROUBLESHOOTING.md` | Gotchas + fixes (sub-agent worktree quirk, etc.). |
| `agents/*.md` | Role prompts you pass to sub-agents via the `Agent` tool. |
| `templates/*.md` | Output skeletons for findings / bug-repro / verification / review / PR. |
| `examples/*.md` | Annotated real-world launches you can adapt. |

## Versatility

The kit is stack-agnostic. It works for:

- Web apps (any framework — Next.js, Remix, Astro, Rails, Django, etc.)
- Libraries / packages
- CLI tools
- Static sites
- Mobile apps (React Native, native iOS/Android)

The only project-side assumption is **git**. Workflows that involve
upstream-fork coordination (the "make Martin's life easier" pattern)
need a remote setup; workflows for personal projects just push to
`origin`.

## Credits

Distilled from a multi-day Allwis.ai debugging engagement (May 2026)
where the methodology evolved through real friction — the rules in
`docs/RULES.md` each trace to a specific incident.
