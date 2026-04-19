# TarkovGunsmith

A modern, AI-first rebuild of the defunct [TarkovGunsmith](https://github.com/Xerxes-17/TarkovGunsmith) — a community tool for Escape from Tarkov players to evaluate weapon builds, ammo-vs-armor matchups, and ballistic outcomes.

> **Status:** Foundation + `packages/ballistics` shipped. Monorepo, CI, AI workflow Tier B, and the pure-TS ballistic math package are live (100% coverage, 45 tests). Still pending: `packages/tarkov-types`, `packages/tarkov-data`, `packages/ui`, `apps/data-proxy`, `apps/builds-api`, `apps/web`. See [`docs/superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md`](docs/superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md) for the full design.

## What this project is

A serverless, edge-hosted, free-to-host web app on the Cloudflare ecosystem. Built explicitly to be developed _with_ Claude as the primary collaborator.

- **Frontend:** Vite + React + TypeScript SPA → Cloudflare Pages
- **Edge backend:** Two Cloudflare Workers (`data-proxy` for GraphQL caching, `builds-api` for KV-backed share URLs)
- **Data:** [`api.tarkov.dev`](https://api.tarkov.dev) (community GraphQL API)
- **Math:** Pure-TS ballistics package, runs client-side
- **UI:** Tailwind v4 + shadcn/ui, dark-first

## Where to look first

| If you want to …                           | Read                                                                                                                                         |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Understand _why_ anything is the way it is | [`docs/superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md`](docs/superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md) |
| See the locked architectural decisions     | `docs/adr/` (ADR-0001 onwards)                                                                                                               |
| Plan a new feature                         | Use `superpowers:brainstorming`, then `writing-plans` → output goes to `docs/plans/`                                                         |
| Understand the AI workflow tier we're on   | [`docs/ai-workflow/tier-b.md`](docs/ai-workflow/tier-b.md)                                                                                   |
| Activate the next AI workflow tier         | [`docs/ai-workflow/tier-c-upgrade.md`](docs/ai-workflow/tier-c-upgrade.md)                                                                   |
| Work in a specific app/package             | That directory's own `CLAUDE.md`                                                                                                             |

## How we work here (Tier B)

Every feature flows: **brainstorm → spec → plan → TDD execution → code review → PR → merge → auto-deploy.**

- Specs live in `docs/superpowers/specs/`
- Plans live in `docs/plans/`
- Architectural decisions live in `docs/adr/`
- Project-specific Claude skills live in `.claude/skills/`
- Project-specific subagents live in `.claude/agents/`

Skip none of these steps. Even "simple" changes warrant a plan — it takes a minute and prevents drift.

## Project conventions (preview — full version after Milestone 0)

- **Package manager:** pnpm (workspaces) + Turborepo
- **Style:** Prettier + ESLint, TypeScript strict mode everywhere
- **Tests:** Vitest for units, Playwright for e2e, `@cloudflare/vitest-pool-workers` for Worker tests
- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`)
- **Branches:** `main` is protected; all changes via PR
- **Deploy:** push to `main` → CF Pages (frontend) and `wrangler deploy` (workers) via GitHub Actions

## Repo layout (target)

```
apps/web              Vite SPA (the user-facing site)
apps/data-proxy       CF Worker — GraphQL cache layer
apps/builds-api       CF Worker — KV-backed build sharing
packages/ballistics   Pure TS — penetration & damage math
packages/tarkov-types Generated GraphQL types + Zod schemas
packages/tarkov-data  Typed query layer (TanStack Query hooks)
packages/ui           Shared shadcn components, design tokens
docs/                 Specs, plans, ADRs, AI workflow guides
.claude/              Project skills, agents, settings, commands
```

This layout is created across Milestones 0a–0d. After 0a (current), only `docs/`, `.claude/`, and root config files exist.

## Local development

```bash
pnpm install          # install everything
pnpm typecheck        # tsc across all packages
pnpm lint             # eslint across all packages
pnpm format:check     # prettier check
pnpm test             # vitest across all packages
pnpm format           # auto-format
echo "feat: foo" | pnpm exec commitlint --stdin-only  # test a commit message
```

Pre-commit (via Husky 9) runs `lint-staged` on changed files (`eslint --fix --max-warnings 0` and `prettier --write`). Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/) (enforced by commitlint).

## CI

GitHub Actions runs typecheck, lint, format check, and tests on every push and PR. See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Releases & versioning

Versioning is fully automated via [release-please](https://github.com/googleapis/release-please-action). On every push to `main`, the workflow inspects Conventional Commits since the last release and opens (or updates) a `chore(release): vX.Y.Z` PR with an auto-generated CHANGELOG.

- `feat:` → minor bump
- `fix:` / `perf:` → patch bump
- `feat!:` or any `BREAKING CHANGE:` footer → major bump
- `chore:` / `ci:` / `build:` / `test:` / `style:` → no version bump (hidden from changelog)

Merging the release PR creates a Git tag, a GitHub Release, and bumps `package.json` automatically. Never tag manually.

## Gotcha: per-package `tsconfig.json` is required

The root ESLint config uses typescript-eslint's `projectService: true` with the root `tsconfig.json` which only `include`s root-level `.ts` files. Any `.ts`/`.tsx` file under `apps/*` or `packages/*` MUST belong to a package-local `tsconfig.json` — otherwise `eslint --fix` (in pre-commit and CI) will fail with `was not found by the project service`. Every new app or package added in 0b/0c/0d must ship its own `tsconfig.json` extending `tsconfig.base.json`.

## AI tooling installed

- **`.claude/settings.json`** — permissions allowlist (pnpm, vitest, wrangler, gh, git) + post-edit `tsc --noEmit` hook for `.ts`/`.tsx` files
- **`.claude/skills/`** — `add-data-query`, `add-calc-function`, `add-feature-route`, `verify-data-shape`, `update-tarkov-schema`
- **`.claude/agents/`** — `tarkov-api-explorer` (read-only research), `ballistics-verifier` (math correctness)

## Acknowledgements

- Original [TarkovGunsmith](https://github.com/Xerxes-17/TarkovGunsmith) by [Xerxes-17](https://github.com/Xerxes-17)
- [the-hideout](https://github.com/the-hideout) ecosystem — `tarkov-api`, `tarkov-dev-image-generator`, etc.
- Battlestate Games — Escape from Tarkov
