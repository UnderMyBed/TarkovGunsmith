> **For external contributors:** This file is the maintainer handbook for working on this repo with Claude. You are **not required** to adopt the workflow described here to submit a PR. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the contributor bar.

---

# TarkovGunsmith

A modern, AI-first rebuild of the defunct [TarkovGunsmith](https://github.com/Xerxes-17/TarkovGunsmith) — a community tool for Escape from Tarkov players to evaluate weapon builds, ammo-vs-armor matchups, and ballistic outcomes.

> **Status: live.** 13 routes on the $0/mo Cloudflare free tier — Pages for the SPA, one Worker
> (`builds-api`) plus KV behind share URLs, and Pages Functions that render Open Graph cards:
>
> `/` `/builder` `/builder/:id` `/builder/compare` `/builder/compare/:pairId` `/calc` `/matrix`
> `/sim` `/adc` `/aec` `/data` `/charts` `/smoke`
>
> Ballistics, the build optimizer, and `tarkov.dev` profile import all run client-side. The UI is
> the "Field Ledger" aesthetic — Bungee display + Chivo body + Azeret Mono numerics, amber-phosphor
> accent, corner-bracketed panels, tick-mark dividers, and the `@tarkov/ui` primitives. Dark only;
> there is no light theme.
>
> Deploys fire on release-please PR merges (tagged version bumps) — feature PR merges stage changes
> on `main` without deploying.
>
> Planned and in-flight work lives in the
> [issue tracker](https://github.com/UnderMyBed/TarkovGunsmith/issues), not in this file.

## What this project is

A serverless, edge-hosted, free-to-host web app on the Cloudflare ecosystem. Built explicitly to be developed _with_ Claude as the primary collaborator.

- **Frontend:** Vite + React + TypeScript SPA → Cloudflare Pages
- **Edge backend:** One Cloudflare Worker (`builds-api` for KV-backed share URLs)
- **Data:** [`json.tarkov.dev`](https://json.tarkov.dev/endpoints) (community JSON API). The GraphQL API this project was built on went down in July 2026 ([the-hideout/tarkov-api#474](https://github.com/the-hideout/tarkov-api/issues/474)) and tarkov.dev itself now runs on the JSON API.
- **Math:** Pure-TS ballistics package, runs client-side
- **UI:** Tailwind v4 + shadcn/ui, dark-first

## Where to look first

| If you want to …                           | Read                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Understand _why_ anything is the way it is | `docs/adr/` for the locked decisions; `git log` for everything else — commit bodies carry the why |
| See the locked architectural decisions     | `docs/adr/` (ADR-0001 onwards)                                                                    |
| Propose a new feature                      | Open an issue. Planned work lives in the tracker, never in a committed document                   |
| Deploy, rotate a token, set up locally     | `docs/operations/`                                                                                |
| Work in a specific app/package             | That directory's own `CLAUDE.md`                                                                  |

## How we work here

Every change flows: **issue → TDD execution → code review → PR → merge → release PR → deploy.**

**Docs state what is true. The tracker states what is planned. Commits state what changed.**
Do not mix them. No plan documents, no spec archive, no progress logs, no milestone narrative in
technical docs. The reasoning behind a change belongs in its commit body and PR description, where
it stays attached to the diff it explains.

- Planned and in-flight work lives in the [issue tracker](https://github.com/UnderMyBed/TarkovGunsmith/issues)
- Architectural decisions live in `docs/adr/` — these record what was decided and why, and stay true
- Runbooks live in `docs/operations/`
- Project-specific Claude skills live in `.claude/skills/`
- Project-specific subagents live in `.claude/agents/`

### Testing discipline (hard rule)

- **Every feature PR includes e2e coverage.** If the PR adds a route to the `__root.tsx` nav, `apps/web/e2e/smoke.spec.ts` gets a new entry in the `ROUTES` array. If it adds a user-facing interaction flow worth protecting, a new test file.
- **"Visual walkthrough deferred" is no longer acceptable.** If you can't verify a change works in a browser, you can't ship it. Playwright is the verification mechanism; run it locally with `pnpm --filter @tarkov/web build && pnpm --filter @tarkov/web test:e2e` before pushing. **The build is not optional** — Playwright serves `dist/` via `wrangler pages dev`. `playwright.config.ts` checks for `apps/web/dist/index.html` while the config is still evaluating and stops with the command that fixes it, so an unbuilt tree fails in a second instead of timing out.
- **No spec may depend on a live third party.** Specs import `test`/`expect` from `e2e/upstream.js`, never from `@playwright/test`. That module answers `json.tarkov.dev` from the committed captures and fails the test — naming the URL — on any live host not on its allowlist. Google Fonts is the one deliberate exception, because three tests assert the real font `<link>` resolves. Live-upstream drift is checked instead by `pnpm verify:upstream`, on a schedule, deliberately off CI.
- **Console errors fail the build.** If a real false positive appears, allowlist it in `smoke.spec.ts` with a comment explaining why.
- **Fonts are load-checked.** The Bungee / Chivo / Azeret Mono fonts are part of the contract — changing them means updating the font-load test.

## Project conventions

- **Package manager:** pnpm (workspaces) + Turborepo
- **Style:** Prettier + ESLint, TypeScript strict mode everywhere
- **Styling:** design tokens only for colour and radius — the `@theme` block in `packages/ui/src/styles/index.css` is the palette, and raw Tailwind palette classes (`bg-red-700`) do not belong in app code. Tailwind scans `packages/ui/src` through the `@source` directive in that same file; without it, a class used only by a `@tarkov/ui` primitive ships with no matching CSS rule (issue #162), and `apps/web/src/styles.test.ts` compiles the stylesheet to guard against exactly that. The neighbouring `@source not` exclusions for test files are load-bearing: a scanned test file that names a class makes Tailwind emit it, which would let the guard pass on the strength of its own assertion.
- **Tests:** Vitest for units, Playwright for e2e, `@cloudflare/vitest-pool-workers` for Worker tests
- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`)
- **Branches:** `main` is protected; all changes via PR
- **Deploy:** release-please PR merge (tagged version bump) → CF Pages (frontend) and `wrangler deploy` (workers) via GitHub Actions. Feature PR merges to `main` stage changes without deploying.

## Repo layout

```
apps/web              Vite SPA (the user-facing site) + its Pages Functions
apps/builds-api       CF Worker — KV-backed build sharing
packages/ballistics   Pure TS — penetration & damage math
packages/tarkov-data  Typed, Zod-validated query layer over json.tarkov.dev
packages/ui           Shared shadcn components, design tokens
packages/optimizer    Pure TS — constraint solver behind Builder's "optimize"
packages/og           Pure TS — Open Graph share cards (satori → resvg → PNG)
packages/repo-guards  Vitest guards over repo config; tests only, nothing ships
docs/                 ADRs and operations runbooks
.claude/              Project skills, agents, settings
```

## Local development

```bash
pnpm install          # install everything
pnpm typecheck        # tsc across all packages
pnpm lint             # eslint across all packages
pnpm format:check     # prettier check
pnpm test             # vitest across all packages
pnpm format           # auto-format
echo "feat: foo" | pnpm exec commitlint  # test a commit message (commitlint 21 dropped --stdin-only; reading stdin is now the default when --edit/--env/--from/--to are omitted)
```

Pre-commit (via Husky 9) runs `lint-staged` on changed files (`eslint --fix --max-warnings 0` and `prettier --write`). Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/) (enforced by commitlint).

### Running the full stack locally

```bash
pnpm dev              # turbo fan-out → web (5173) + builds-api (8788)
pnpm seed:build       # POST a fixture build to local builds-api; prints /builder/:id URL
```

Fresh-clone setup, `.dev.vars` conventions, OG-card local testing, and the production secret runbook all live in [`docs/operations/local-development.md`](docs/operations/local-development.md).

## CI

GitHub Actions runs typecheck, lint, format check, Vitest, and Playwright smoke tests on every pull_request. See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

**Budget-conscious triggers:**

- CI fires on `pull_request` (the pre-merge gate) + `workflow_dispatch` (release-please fires this on its branch). It does NOT fire on push to `main` — branch protection requires PRs to be up-to-date + green before merging, so post-merge CI would be a duplicate of the just-passed PR check.
- Docs-only PRs (changes confined to `docs/**`, `*.md`, `.gitignore`, `LICENSE`, issue templates) skip the whole pipeline via a `dorny/paths-filter` gate at the top of the job. The job name still reports success to satisfy branch protection.

**Turbo cache:** `.turbo/cache` sits at the repo root and is shared with every git worktree beneath it. A task whose `dependsOn` is incomplete can therefore replay a recorded pass for code it never saw — `lint` did exactly that until it declared `dependsOn: ["^build"]`. When a green result looks too easy, re-run it with `pnpm turbo run <task> --force`.

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

The root ESLint config uses typescript-eslint's `projectService: true` with the root `tsconfig.json` which only `include`s root-level `.ts` files. Any `.ts`/`.tsx` file under `apps/*` or `packages/*` MUST belong to a package-local `tsconfig.json` — otherwise `eslint --fix` (in pre-commit and CI) will fail with `was not found by the project service`. Every new app or package must ship its own `tsconfig.json` extending `tsconfig.base.json`.

## AI tooling installed

- **`.claude/settings.json`** — permissions allowlist (pnpm, vitest, wrangler, gh, git) + post-edit `tsc --noEmit` hook for `.ts`/`.tsx` files
- **`.claude/skills/`** — `add-data-query`, `add-calc-function`, `add-feature-route`
- **`.claude/agents/`** — `tarkov-api-explorer` (read-only data-layer research), `ballistics-verifier` (math correctness)

## Acknowledgements

- Original [TarkovGunsmith](https://github.com/Xerxes-17/TarkovGunsmith) by [Xerxes-17](https://github.com/Xerxes-17)
- [the-hideout](https://github.com/the-hideout) ecosystem — `tarkov-api`, `tarkov-dev-image-generator`, etc.
- Battlestate Games — Escape from Tarkov
