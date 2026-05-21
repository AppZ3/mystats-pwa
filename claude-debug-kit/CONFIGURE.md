# Per-project configuration

> Fill these blanks in by **asking the user**, by **reading the
> project's `CLAUDE.md` / `CONTRIBUTING.md`**, or by inspecting the
> project tree (`package.json`, `requirements.txt`, etc.).
>
> Once filled in, save this file to the project's `.coordinator-state.md`
> (gitignored) so future sessions don't have to re-ask.

## Project identity

| Field | Value |
|---|---|
| Project name | _e.g. "Allwis.ai"_ |
| Repo path on disk | _e.g. `~/Documents/AllWis/allwis-debugger/`_ |
| Working branch | _e.g. `master`, `main`, `develop`_ |
| Fork setup? | `yes` / `no` — does the user own a fork and contribute via PRs to a separate upstream? |
| Upstream URL | _only if fork=yes — e.g. `https://github.com/maintainer/repo`_ |
| Fork URL | _e.g. `https://github.com/<user>/<repo>`_ |
| Maintainer name | _the human who reviews/merges PRs — used in PR templates_ |
| Maintainer's GitHub | _e.g. `maintainer-handle`_ |

## Stack snapshot

| Field | Value |
|---|---|
| Primary language | _TS / JS / Python / Rust / Go / etc._ |
| Framework | _Next.js 16 / Django 5 / Rails 7 / Astro / etc. — only the load-bearing one_ |
| Package manager | _npm / pnpm / yarn / pip / poetry / cargo / etc._ |
| Test runner | _vitest / jest / pytest / cargo test / etc._ |
| Linter | _eslint / ruff / clippy / etc._ |
| Database | _Postgres + Supabase / Postgres + Prisma / SQLite / MongoDB / none / etc._ |
| Hosting | _Vercel / Fly.io / Render / self-hosted / etc._ |

## Project conventions

| Field | Value |
|---|---|
| Branch naming | _e.g. `claude/<slug>-<hash>` off latest master_ |
| PR squash-merge? | `yes` / `no` — affects branch reuse policy |
| Commit message style | _e.g. conventional commits (`fix:`, `feat:`)_ |
| `CLAUDE.md` exists? | `yes` / `no` — if yes, read it; the project's own conventions take precedence |
| ESLint restricted imports? | _list any — these are common false-positive sources for audit findings_ |

## Build / test commands

| Action | Command |
|---|---|
| Install deps | _e.g. `npm install`_ |
| Run tests | _e.g. `npm test` / `npx vitest run` / `pytest`_ |
| Lint | _e.g. `npm run lint` / `ruff check .`_ |
| Type check | _e.g. `npm run typecheck` / `tsc --noEmit`_ |
| Build (smoke) | _e.g. `npm run build`_ |
| Local dev | _e.g. `npm run dev` / `python manage.py runserver`_ |

## Local dev prerequisites

_What does the user need installed to run tests locally? (Docker,
specific Node version, env vars, etc.)_

## External services

_Stripe / Resend / Anthropic / Sentry / etc. — list with note
on whether keys are present in `.env.local` or need to be obtained._

## Known pre-existing test failures

_Tests that fail on the working branch independent of any change
this session makes. These are the "expected fails" the coordinator
ignores when assessing whether a change introduced regressions._

## Maintainer-facing tone

_How does the maintainer prefer PR descriptions framed?_

- _Brief? Verbose?_
- _What sections do they expect? (TL;DR / threat model / fix /
  what-Martin-needs-to-do / how-it-was-found / etc.)_
- _Any vocabulary preferences? ("tenant" vs "organization", etc.)_

---

## How to use this once filled in

1. Save a copy of this file at `<project-root>/.coordinator-state.md`
   so future sessions in the same project pick it up automatically.
2. Add `.coordinator-state.md` to `.git/info/exclude` (the project's
   local-only gitignore augmentation) so it never gets committed.
3. Reference these values when:
   - Spawning sub-agents (path to repo, build commands).
   - Writing PR descriptions (maintainer name, tone preferences).
   - Filing branches (naming convention).
   - Validating audit findings (eslint restricted imports).
