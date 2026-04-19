# TarkovGunsmith Rebuild — Design Spec

**Date:** 2026-04-18
**Status:** Approved (brainstorming → implementation planning)
**Owner:** UnderMyBed (mattshipman85@gmail.com)
**Prior art:** [Xerxes-17/TarkovGunsmith](https://github.com/Xerxes-17/TarkovGunsmith) (defunct)

## 1. Purpose & vision

Rebuild the defunct TarkovGunsmith site as a modern, AI-first, free-to-host web app. The original was a community tool for Escape from Tarkov players to evaluate weapon builds, ammo-vs-armor matchups, and ballistic outcomes. This rebuild keeps the spirit but trades the original's C# backend + CRA frontend for a serverless, edge-hosted, monorepo architecture explicitly engineered to be developed _with_ Claude as the primary collaborator.

**Goals:**

1. Ship the three "killer" tools fast (Weapon Builder, AmmoVsArmor matrix, Ballistic Calculator).
2. Stay on free-tier hosting indefinitely.
3. Lay AI-collaboration foundations from day one (Tier B), with a documented upgrade path to fully autonomous workflows (Tier C).
4. Reach feature parity with the original in a second wave, then surpass it with new differentiators (build comparison, optimization, share cards).

**Non-goals (MVP):**

- User accounts / auth.
- Server-side rendering or SEO optimization beyond basic meta tags.
- Mobile-first design (desktop-first, mobile-responsive — not optimized for raid-side phone use).
- Internationalization.
- Hosting our own copy of tarkov-api or tarkov-data-manager.

## 2. Locked decisions (from brainstorming)

| #   | Decision             | Choice                                                                                                |
| --- | -------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | Feature scope        | **MVP first** — three killer features, then iterate to parity                                         |
| 2   | Backend posture      | **SPA + thin edge backend from day 1** (Cloudflare Workers + KV)                                      |
| 3   | Frontend stack       | **Vite + React + TypeScript**, TanStack Router/Query, Zod, Tailwind v4, shadcn/ui, Vitest, Playwright |
| 4   | AI workflow ambition | **Tier B implemented now**, Tier C fully documented as future-state upgrade                           |
| 5   | Visual identity      | **Fresh, opinionated dark UI** on shadcn defaults, accented with Tarkov item iconography              |

## 3. System architecture

```
                        ┌──────────────────────────┐
                        │  api.tarkov.dev (GraphQL)│   ← upstream, not ours
                        └────────────┬─────────────┘
                                     │ HTTPS GraphQL
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
    ┌─────────▼─────────┐  ┌─────────▼─────────┐  ┌─────────▼─────────┐
    │  Browser (SPA)    │  │ Worker: data-proxy│  │ Worker: builds-api│
    │  Vite + React TS  │◄─┤ (cache + reshape) │  │ (share/save KV)   │
    │  CF Pages         │  │ CF Workers + Cache│  │ CF Workers + KV   │
    └─────────┬─────────┘  └───────────────────┘  └───────────────────┘
              │ same-origin /api/* via Pages → Workers binding
              ▼
        Static assets on Cloudflare Pages
```

Three deployable units, all on the Cloudflare free tier:

- **`apps/web`** — Vite SPA, deployed to Cloudflare Pages.
- **`apps/data-proxy`** — Worker proxying tarkov-api GraphQL; uses Cache API for edge caching and may reshape responses to shrink payloads for our specific queries. Wired to the SPA via Pages → Workers service binding so the browser calls `/api/data/*` same-origin (no CORS overhead).
- **`apps/builds-api`** — Worker with a KV namespace for short-URL build sharing. D1 is reserved for later (favorites, view counts) but unused at MVP.

The math engine (ballistic + armor calculations) lives in `packages/ballistics` as a pure-TS library. It runs entirely client-side in the SPA but is also importable by Workers if we ever need server-side calculation (e.g. pre-rendered build summary cards).

## 4. Repo layout

pnpm workspaces + Turborepo monorepo.

```
TarkovGunsmith/
├── apps/
│   ├── web/                  Vite + React + TS SPA
│   ├── data-proxy/           CF Worker — GraphQL cache layer
│   └── builds-api/           CF Worker — KV-backed build sharing
├── packages/
│   ├── ballistics/           Pure TS — penetration, damage falloff, armor degradation
│   ├── tarkov-types/         Generated GraphQL types + Zod schemas
│   ├── tarkov-data/          Typed query layer (TanStack Query hooks + graphql-request)
│   └── ui/                   Shared shadcn components, design tokens, Tarkov icons
├── docs/
│   ├── superpowers/specs/    Design specs (this doc)
│   ├── plans/                Implementation plans (one per feature)
│   ├── adr/                  Architecture Decision Records
│   └── ai-workflow/          Tier B usage guide + Tier C upgrade playbook
├── .claude/
│   ├── agents/               Project subagents
│   ├── skills/               Project skills
│   ├── settings.json         Permissions, hooks, MCP config
│   └── commands/             Slash commands
├── .github/workflows/        CI: typecheck, lint, test, deploy
├── CLAUDE.md                 Root agent guide
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

Every `apps/*` and `packages/*` directory ships its own `CLAUDE.md` describing purpose, conventions, and "how to extend."

## 5. Data layer

- **Source of truth:** `api.tarkov.dev` (community GraphQL API, run by the-hideout).
- **Codegen:** `graphql-codegen` reads tarkov-api's schema and emits TypeScript types + Zod schemas into `packages/tarkov-types`. Re-run nightly via GitHub Action; PR opened automatically if the schema changes.
- **Client:** `packages/tarkov-data` exports typed TanStack Query hooks (`useAmmoList()`, `useArmorList()`, `useWeapon(id)`, etc.) that call `/api/data/graphql` (our Worker), which forwards to tarkov-api with edge caching. Zod validates every response in dev (assert) and warns in prod.
- **Iconography:** item icons pulled from `tarkov-dev-image-generator` CDN (`assets.tarkov.dev`). No images committed to this repo.
- **Cache strategy:** Cache API on the Worker — TTL 1h for prices, 24h for static item data. Bust on tarkov-api `update` webhook in a later milestone.

## 6. Math engine — `packages/ballistics`

Pure-TS port of relevant math from the original `WishGranter` C# / `Ratstash`. Public surface:

- `simulateShot(ammo, armor, distance) → { didPenetrate, damage, armorDamage, residualPen }`
- `simulateBurst(ammo, armor, shots, distance) → ShotResult[]`
- `armorEffectiveness(ammo[], armor[]) → matrix` (powers AmmoVsArmor)
- `weaponSpec(weaponId, mods[]) → { ergo, recoil, weight, accuracy, … }` (powers Weapon Builder)

100% TDD. Test fixtures = curated cases from in-game wiki + cross-checked against the original C# output for sanity. **No game data hardcoded** — all inputs come from typed args, so the package is a pure function of its inputs and trivially unit-testable.

## 7. Workers (edge backend)

### `apps/data-proxy`

- Single GraphQL POST endpoint: `/graphql`.
- Forwards to `api.tarkov.dev`. Adds Cache API caching keyed on a hash of `(query, variables)`.
- ~50 LOC. Also serves `/healthz` and `/schema-hash` (used by the codegen job to detect upstream changes).

### `apps/builds-api`

- `POST /builds` → write `{ schema_version, weapon, mods[], notes }` to KV under `b:<nanoid8>`, return `{ id, url }`.
- `GET /builds/:id` → fetch from KV, return JSON (or 404).
- 30-day TTL on KV writes by default; bumpable via a "pin this build" action later.
- Rate-limited via Cloudflare Turnstile on `POST` (free) — no auth required.
- Schema-versioned values so older shared builds keep working as the build model evolves.

## 8. Frontend MVP features

Three routes (TanStack Router, file-based, type-safe):

### `/builder` — Weapon Builder

Pick a weapon → select compatible mods → see live recalculated stats (ergo, recoil, weight, accuracy) → "Save build" returns a share URL. Uses shadcn `Combobox`, `Card`, `Tabs`. State is fully serializable to URL hash so refresh-survives even before saving to the API.

### `/matrix` — AmmoVsArmor (and inverse)

shadcn `DataTable` with virtual scrolling (TanStack Table + `@tanstack/react-virtual`). Color-coded cells (red / yellow / green) for shots-to-kill. Filters: caliber, armor class, traders.

### `/calc` — Ballistic Calculator

Form-driven (ammo, armor, distance) → result card showing penetration probability, damage, armor damage. shadcn `Form` + Zod resolver.

### Plus

- `/` landing
- `/about` — credits to original author + the-hideout
- `/builds/:id` — read-only shared build view (server-side fetch by Worker, hydrate in client)

Dark-mode default; light-mode toggle for completeness.

## 9. AI-first dev workflow — Tier B (active from day one)

### Repo scaffolding

- Root `CLAUDE.md` + per-package `CLAUDE.md` (each ≤200 lines: purpose, conventions, "how to add an X").
- `docs/superpowers/specs/` — every feature starts here.
- `docs/plans/` — every implementation gets a plan file before code is written.
- `docs/adr/` — architectural decisions logged. This doc seeds **ADR-0001**.

### `.claude/` setup

- `settings.json` permissions allowlist for routine tools: `pnpm`, `vitest`, `wrangler`, `gh`, `graphql-codegen`.
- Hooks: post-edit `pnpm typecheck` for `.ts`/`.tsx`; post-commit verify for `packages/ballistics`.
- MCP servers: `context7` (already on); Cloudflare MCP for deploys (when available); GitHub MCP for issues/PRs.

### Project-specific skills (`.claude/skills/`)

- `add-data-query` — scaffold a new GraphQL query + hook + types
- `add-calc-function` — scaffold a new ballistics fn with TDD pre-baked
- `add-feature-route` — scaffold a new route + page + tests
- `verify-data-shape` — Zod-check tarkov-api responses for a given query
- `update-tarkov-schema` — re-run codegen, reconcile breaking changes

### Project-specific subagents (`.claude/agents/`)

- `tarkov-api-explorer` — read-only; reads tarkov-api schema/docs, answers "what fields exist for X?"
- `ballistics-verifier` — given a calc change, runs ballistics tests + cross-checks against fixtures

(Global subagents `feature-dev` and `code-reviewer` are reused as-is.)

### Default workflow ("the Tier B loop")

1. Idea → `superpowers:brainstorming` → spec in `docs/superpowers/specs/`.
2. Spec → `superpowers:writing-plans` → plan in `docs/plans/`.
3. Plan → `superpowers:executing-plans` (TDD enforced) → branch + commits.
4. Branch complete → `superpowers:requesting-code-review` → review pass.
5. PR → CI green → merge → CF Pages auto-deploys.

## 10. AI-first dev workflow — Tier C (documented now, activated later)

`docs/ai-workflow/tier-c-upgrade.md` will contain a complete activation checklist. Summary:

- **Issue-driven dev:** GitHub issue templates + `.claude/skills/triage-issue` that turns an issue into brainstorm → spec → plan → worktree branch → PR.
- **Scheduled agents:**
  - Daily `tarkov-schema-watcher` (cron) — checks tarkov-api schema hash, opens PR with regenerated types if changed.
  - Weekly `data-fixture-refresh` — refreshes test fixtures from current API state, opens PR.
  - On-demand `dependency-bumper` — runs Renovate-like logic via agent so it can read changelogs and explain breaks.
- **Parallel dispatch:** `superpowers:dispatching-parallel-agents` recipes for feature work that touches `web` + `data-proxy` + `tarkov-data` simultaneously.
- **Long-lived module agents** (most experimental): `agents/builder-owner.md`, `agents/matrix-owner.md`, `agents/ballistics-owner.md` — domain-expert agents you can hand "make builder do X" to without re-explaining context.
- **Post-merge agents:** docs updater, ADR drafter, deploy verifier (smoke-test the live URL after CF deploys).
- **Activation checklist:** "to flip from B to C, do these 8 things in order." Each step is a one-line PR.

## 11. Testing strategy

- **`packages/ballistics`** — Vitest, TDD-first, target 100% line coverage. Cross-check fixtures against original C# outputs.
- **`packages/tarkov-data`** — Vitest with MSW mocking GraphQL. Zod validation of fixture shapes.
- **`apps/web`** — Vitest for component logic, **Playwright** for the three MVP routes + share-link round-trip.
- **`apps/builds-api`** — Vitest with `@cloudflare/vitest-pool-workers` (real Workers runtime + Miniflare KV).
- **CI:** GitHub Actions — typecheck, lint, unit on every push; e2e on PR; deploy preview on PR via CF Pages.

## 12. Deployment & environments

- **`main`** branch → production (`tarkovgunsmith.app` once a domain is registered; otherwise `tarkovgunsmith.pages.dev`).
- **PR branches** → CF Pages preview URLs auto-generated.
- **Workers** deployed via `wrangler deploy` from CI on `main` merges. Two environments per Worker: `production` and `preview`.
- **Secrets:** GitHub Actions secrets for `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `TURNSTILE_SECRET`. Nothing else needed.
- **Cost ceiling:** $0/mo on free tier indefinitely. Optional cost: a domain (~$10/yr).

## 13. Roadmap & milestones

### Milestone 0 — Foundation (no user-visible features)

- Monorepo scaffold (apps + packages stubbed).
- CI green.
- Both Workers deployed-but-empty.
- Pages deploying a landing page.
- AI workflow Tier B fully wired (CLAUDE.md hierarchy, skills, subagents, MCP, hooks).
- `packages/ballistics` + `packages/tarkov-data` with first-pass implementations & tests.

### Milestone 1 — MVP (the three killer features)

- `/calc` — Ballistic Calculator (smallest, ships first, validates whole stack end-to-end).
- `/matrix` — AmmoVsArmor table.
- `/builder` — Weapon Builder + share-URL via builds-api.

### Milestone 2 — Parity

- Ballistics Simulator (multi-shot scenarios).
- ADC (Armor Damage Calc).
- AEC (Armor Effectiveness Calc, the inverse view).
- Full DataSheets: weapons, ammo, armor, modules.
- Effectiveness charts.

### Milestone 3 — Differentiators

- Build comparison (diff two builds side-by-side).
- Build optimization (find min-recoil mod set under user constraints).
- Trader-availability filter on builds.
- OG share cards (server-rendered build summary images).

### Milestone 4 — Tier C activation

User-triggered (not date-bound). Likely between M2 and M3. Follow `docs/ai-workflow/tier-c-upgrade.md`.

## 14. Open questions / deferred decisions

- **Domain name** — defer until M1 ships. `tarkovgunsmith.pages.dev` is fine until then.
- **Analytics** — Cloudflare Web Analytics (free, privacy-respecting) likely default; revisit at M1.
- **Error tracking** — Sentry free tier vs. Cloudflare's built-in; revisit at M1.
- **Original-author outreach** — courtesy ping to Xerxes-17 before M1 ships, in case they want to be credited beyond `/about` or contribute.
- **License** — assume MIT unless you object.

## 15. Acknowledgements

- Original [TarkovGunsmith](https://github.com/Xerxes-17/TarkovGunsmith) by Xerxes-17.
- [the-hideout](https://github.com/the-hideout) ecosystem (`tarkov-api`, image generator, SVG maps, leaflet tiles) — the data layer this rebuild stands on.
- Battlestate Games — Escape from Tarkov (data subject of this tool).
