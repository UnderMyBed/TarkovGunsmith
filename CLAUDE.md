# TarkovGunsmith

A modern, AI-first rebuild of the defunct [TarkovGunsmith](https://github.com/Xerxes-17/TarkovGunsmith) — a community tool for Escape from Tarkov players to evaluate weapon builds, ammo-vs-armor matchups, and ballistic outcomes.

> **Status:** Pre-implementation. Design approved, no code yet. See [`docs/superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md`](docs/superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md) for the design spec — it is the source of truth for everything below.

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

This layout is created during Milestone 0. Until then, only `docs/`, `.claude/` (eventually), and this `CLAUDE.md` exist.

## Acknowledgements

- Original [TarkovGunsmith](https://github.com/Xerxes-17/TarkovGunsmith) by [Xerxes-17](https://github.com/Xerxes-17)
- [the-hideout](https://github.com/the-hideout) ecosystem — `tarkov-api`, `tarkov-dev-image-generator`, etc.
- Battlestate Games — Escape from Tarkov
