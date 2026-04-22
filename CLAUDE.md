# TarkovGunsmith

A modern, AI-first rebuild of the defunct [TarkovGunsmith](https://github.com/Xerxes-17/TarkovGunsmith) — a community tool for Escape from Tarkov players to evaluate weapon builds, ammo-vs-armor matchups, and ballistic outcomes.

> **Status: M1 + M1.5 + M2 + M3 frontend design pass all live.** The whole stack — 8 routes, Builder-forward landing, full ballistics + reference tools — now ships in the "Field Ledger" aesthetic.
>
> - **M1 (v1.0.0):** `/calc`, `/matrix`, `/builder` (flat mod list).
> - **M1.5 (v1.1 – v1.4):** Builder Robustness arc — build schema v1 → v4, save/share URL, slot-based mod compatibility, player-progression gating, UX depth.
> - **M2 (unreleased):** Parity — `/sim`, `/adc`, `/aec`, `/data`, `/charts`.
> - **M3 frontend design pass (unreleased, 5 PRs):** "Field Ledger" aesthetic — Bungee display + Chivo body + Azeret Mono numerics, amber-phosphor accent, corner-bracketed panels, tick-mark dividers, and new `@tarkov/ui` primitives (`Pill`, `Stamp`, `SectionTitle`, `StatRow`, `Card variant="bracket"`). Applied across every route.
>
> Plus `/smoke` + `/` (Builder-forward landing). All on $0/mo Cloudflare free tier (Workers + Pages + KV). Deploys fire on release-please PR merges (tagged version bumps) — feature PR merges stage changes on `main` without deploying.
>
> **Roadmap from here — M3 Differentiators, 4 of 5 remaining:** (1) ✅ Frontend design pass. (2) Build comparison (diff two builds). (3) Build optimization (constraint solver). (4) OG share cards (server-rendered PNG). (5) `tarkov.dev` profile import. See [`docs/superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md`](docs/superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md) §13. Visual polish / fix-up items discovered during the design pass are tracked ad-hoc and landed before the next feature PR.
>
> **Deferred M1.5 items (still open):** Undo/redo; `allowedCategories` slot filtering; `craftsFor`/`bartersFor` in availability; Dialog primitive; weapon preset content; slot-tree polish (sticky headers, keyboard nav); recursion depth 5.
>
> **Deferred M2 items (still open):** Helmet-only query for `/sim`'s helmet picker; thorax-overflow damage / bleed / probabilistic mode in the Simulator; scenario save/share; ammo caliber column on `/data`.
>
> **Deferred M3 design-polish items:** Light theme; loading skeleton shimmers in the Field Ledger aesthetic; custom favicon + OG social cards (the latter pairs with M3 sub-project 4); keyboard shortcut overlay; real weapon silhouettes. Revisit after functional M3 work lands.
>
> **Cross-milestone deferred:** ~~Playwright e2e~~ — shipped in this PR.

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

### Testing discipline (hard rule)

- **Every feature PR includes e2e coverage.** If the PR adds a new route, `apps/web/e2e/smoke.spec.ts` gets a new entry in the `ROUTES` array. If it adds a user-facing interaction flow worth protecting, a new test file.
- **"Visual walkthrough deferred" is no longer acceptable.** If you can't verify a change works in a browser, you can't ship it. Playwright is the verification mechanism; run it locally with `pnpm --filter @tarkov/web test:e2e` before pushing.
- **Console errors fail the build.** If a real false positive appears, allowlist it in `smoke.spec.ts` with a comment explaining why.
- **Fonts are load-checked.** The Bungee / Chivo / Azeret Mono fonts are part of the contract — changing them means updating the font-load test.

## Project conventions (preview — full version after Milestone 0)

- **Package manager:** pnpm (workspaces) + Turborepo
- **Style:** Prettier + ESLint, TypeScript strict mode everywhere
- **Tests:** Vitest for units, Playwright for e2e, `@cloudflare/vitest-pool-workers` for Worker tests
- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`)
- **Branches:** `main` is protected; all changes via PR
- **Deploy:** release-please PR merge (tagged version bump) → CF Pages (frontend) and `wrangler deploy` (workers) via GitHub Actions. Feature PR merges to `main` stage changes without deploying.

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

### Running the full stack locally

```bash
pnpm dev              # turbo fan-out → web (5173) + data-proxy (8787) + builds-api (8788)
pnpm seed:build       # POST a fixture build to local builds-api; prints /builder/:id URL
```

Fresh-clone setup, `.dev.vars` conventions, OG-card local testing, and the production secret runbook all live in [`docs/operations/local-development.md`](docs/operations/local-development.md).

## CI

GitHub Actions runs typecheck, lint, format check, Vitest, and Playwright smoke tests on every pull_request. See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

**Budget-conscious triggers:**

- CI fires on `pull_request` (the pre-merge gate) + `workflow_dispatch` (release-please fires this on its branch). It does NOT fire on push to `main` — branch protection requires PRs to be up-to-date + green before merging, so post-merge CI would be a duplicate of the just-passed PR check.
- Docs-only PRs (changes confined to `docs/**`, `*.md`, `.gitignore`, `LICENSE`, issue templates) skip the whole pipeline via a `dorny/paths-filter` gate at the top of the job. The job name still reports success to satisfy branch protection.

## Releases & versioning

Versioning is fully automated via [release-please](https://github.com/googleapis/release-please-action). On every push to `main`, the workflow inspects Conventional Commits since the last release and opens (or updates) a `chore(release): vX.Y.Z` PR with an auto-generated CHANGELOG.

- `feat:` → minor bump
- `fix:` / `perf:` → patch bump
- `feat!:` or any `BREAKING CHANGE:` footer → major bump
- `chore:` / `ci:` / `build:` / `test:` / `style:` → no version bump (hidden from changelog)

Merging the release PR creates a Git tag, a GitHub Release, and bumps `package.json` automatically. Never tag manually.

### Known limitation: release PRs need admin-merge

Release-please opens PRs using `GITHUB_TOKEN`. GitHub blocks `pull_request` events from `GITHUB_TOKEN`-pushed PRs (anti-recursion guard), so the CI workflow doesn't auto-run as a PR check. The release-please workflow explicitly fires CI via `workflow_dispatch` on the release branch, but `workflow_dispatch` runs don't satisfy the branch-protection "required status check" gate.

**Today's workflow:** verify the workflow_dispatch CI run on the release branch passed (`gh run list --workflow ci.yml --branch release-please--branches--main--components--tarkov-gunsmith --limit 1`), then `gh pr merge <num> --squash --admin` to bypass the empty status check.

**Cleaner long-term fix:** create a fine-grained PAT scoped to this repo with `contents: write` and `pull-requests: write`, store as `RELEASE_PLEASE_TOKEN` secret, and pass `token: ${{ secrets.RELEASE_PLEASE_TOKEN }}` to the release-please action. PRs created by a PAT trigger normal `pull_request` events. Tracked as a future improvement.

## Deploys

Workers and the SPA deploy to Cloudflare when a **release-please PR is merged** (head commit message starts with `chore(main): release`). Feature PR merges to `main` stage changes without deploying — the release PR is the promotion gate. Merge the release PR (admin-merge, see release note below) when you're ready to ship the accumulated changes. The runbook (token permissions, repo secrets, one-time setup, rotation) lives at [`docs/operations/cloudflare-deploys.md`](docs/operations/cloudflare-deploys.md).

The token uses **least-privilege** scoping — only the four permissions actually needed today (Workers Scripts edit, Workers KV edit, Pages edit, Account Settings read). Add more as features land per the runbook's "Future permissions" table.

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
