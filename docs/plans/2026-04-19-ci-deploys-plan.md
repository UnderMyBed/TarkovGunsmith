# CI Deploys for Workers + Cloudflare Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire automated Cloudflare deploys for `apps/data-proxy`, `apps/builds-api`, and `apps/web` on every merge to `main`. Document the least-privilege API token spec so the user can grant only what's needed today. The workflow ships independently of the user's secret-setup step — it runs and fails loudly with a clear error message until `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are present.

**Architecture:** A single `.github/workflows/deploy.yml` with three parallel jobs (one per deploy target), each using `cloudflare/wrangler-action@v3` (Cloudflare's official Action that handles auth + wrangler invocation). Triggered on `push: branches: [main]`. Concurrency-grouped per target so two rapid merges queue rather than race. The Action gracefully reports missing secrets so we don't have to write our own preamble checks.

**Tech Stack:** GitHub Actions, `cloudflare/wrangler-action@v3`, the existing Wrangler 4 in each Worker/web package.

---

## File map (what exists at the end of this plan)

```
.github/
└── workflows/
    └── deploy.yml                         New — 3 parallel deploy jobs on push to main
docs/
└── operations/
    └── cloudflare-deploys.md              New — operations runbook (token spec, secrets, one-time setup)
apps/
├── data-proxy/CLAUDE.md                   Modified — remove "no CI deploy yet" caveat
├── builds-api/CLAUDE.md                   Modified — same
└── web/CLAUDE.md                          Modified — same
CLAUDE.md                                  Modified — link to the new operations runbook
```

No application code changes — this is pure CI + documentation.

---

## Phase 1: Operations runbook

### Task 1: Create `docs/operations/cloudflare-deploys.md`

**Files:**

- Create: `docs/operations/cloudflare-deploys.md`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p docs/operations
```

Create `docs/operations/cloudflare-deploys.md` with EXACTLY:

````markdown
# Cloudflare Deploys — Operations Runbook

How CI auto-deploys the Workers and the SPA, what the API token needs to be allowed to do, and what one-time manual setup is required.

## Architecture

`.github/workflows/deploy.yml` runs three parallel jobs on every push to `main`:

| Job          | Deploys                            | Wrangler invocation                                      |
| ------------ | ---------------------------------- | -------------------------------------------------------- |
| `data-proxy` | `apps/data-proxy` Worker           | `wrangler deploy` (from `apps/data-proxy/`)              |
| `builds-api` | `apps/builds-api` Worker (uses KV) | `wrangler deploy` (from `apps/builds-api/`)              |
| `pages`      | `apps/web` (Vite build output)     | `wrangler pages deploy ./dist --project-name=tarkov-web` |

All three use [`cloudflare/wrangler-action@v3`](https://github.com/cloudflare/wrangler-action) for auth + dispatch. Concurrency is grouped per job so two rapid merges queue cleanly.

## Required GitHub repo secrets

Add at `https://github.com/UnderMyBed/TarkovGunsmith/settings/secrets/actions/new`:

| Secret                  | Source                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Created at https://dash.cloudflare.com/profile/api-tokens — see "Token spec" below  |
| `CLOUDFLARE_ACCOUNT_ID` | Visible in the Cloudflare dashboard URL or right sidebar of any account-scoped page |

Until both are present, the deploy workflow runs but every job fails with a clear "API token missing" error. CI on the rest of the repo is unaffected.

## API token spec (least-privilege for v0.8.0)

Create at https://dash.cloudflare.com/profile/api-tokens → **Create Token** → **Create Custom Token**.

### Permissions

| Scope       | Permission         | Access | Why                                                            |
| ----------- | ------------------ | ------ | -------------------------------------------------------------- |
| **Account** | Workers Scripts    | Edit   | `wrangler deploy` for `data-proxy` + `builds-api`              |
| **Account** | Workers KV Storage | Edit   | Read/write the `BUILDS` namespace from the `builds-api` Worker |
| **Account** | Cloudflare Pages   | Edit   | `wrangler pages deploy` for `apps/web`                         |
| **Account** | Account Settings   | Read   | Wrangler validates the token against the account on startup    |

### Account resources

**Include:** Specific account → your account only. Do NOT grant "All accounts".

### Zone resources

**None.** No DNS, no custom domains, no page rules — yet.

### Client IP filtering

**None.** Restrict to GitHub Actions IP ranges if you want belt-and-suspenders; not necessary for token security.

### TTL

**1 year**, then rotate. Calendar a reminder.

## Future permissions — add when each feature lands

The token never needs to be deleted — just expanded as the project grows. Edit the existing token at the same dashboard URL and click **Add Permission**.

| When you add…                                        | Add this permission                          |
| ---------------------------------------------------- | -------------------------------------------- |
| A custom domain on a Worker                          | **Workers Routes** (Account) → Edit          |
| CI managing DNS records                              | **DNS** (Zone, scoped to the zone) → Edit    |
| A D1 database (spec reserves it for favorites/views) | **D1** (Account) → Edit                      |
| R2 buckets                                           | **Workers R2 Storage** (Account) → Edit      |
| CI tail logs                                         | **Workers Tail** (Account) → Read            |
| Cloudflare Web Analytics from CI                     | **Account Analytics** (Account) → Read       |
| Workers AI / AI Gateway                              | **Workers AI** (Account) → Edit              |
| Email Routing                                        | **Email Routing Addresses** (Account) → Edit |

## One-time manual setup (after secrets are added)

You can do these locally with `wrangler login` once, OR let the first CI run create them.

### 1. Create the `BUILDS` KV namespace

```bash
pnpm --filter @tarkov/builds-api exec wrangler kv:namespace create BUILDS
# → prints { "binding": "BUILDS", "id": "abc123def456..." }
```

Replace `"id": "REPLACE_ON_FIRST_DEPLOY"` in `apps/builds-api/wrangler.jsonc` with the printed `id`. Commit. KV namespace ids are opaque and NOT secret — committing them is the standard pattern.

### 2. Create the Pages project (or let `wrangler pages deploy` auto-create on first run)

```bash
pnpm --filter @tarkov/web exec wrangler pages project create tarkov-web --production-branch=main
# → creates the project; subsequent deploys go to <project>.pages.dev
```

If you skip this, the first CI deploy will create it implicitly (the `wrangler-action` passes `--branch` automatically).

## How to verify deploys are working

After secrets are added and one-time setup is done, push any commit to `main` (or merge a PR). Then:

```bash
gh run list --workflow deploy.yml --limit 3
gh run view <run-id> --log
```

The three jobs should complete within ~30 seconds each. Live URLs:

- `https://tarkov-data-proxy.<your-subdomain>.workers.dev/healthz` → `ok`
- `https://tarkov-builds-api.<your-subdomain>.workers.dev/healthz` → `ok`
- `https://tarkov-web.pages.dev` → the SPA's landing page

## Rotating the token

1. Create a new token at the same dashboard URL with the same permissions.
2. Update the `CLOUDFLARE_API_TOKEN` repo secret (the value, not the name).
3. Push any commit to `main` to verify deploy still works.
4. Revoke the old token in the dashboard.

## What this runbook does NOT cover

- DNS / custom domains — ship a follow-up plan when you want `tarkovgunsmith.app` instead of `*.pages.dev`/`*.workers.dev`.
- Multi-environment deploys (preview vs. production) — current setup deploys directly to production on every main merge. Add a `staging` environment in `wrangler.jsonc` + a separate `deploy-preview.yml` if/when that's wanted.
- Rollback — Cloudflare Pages keeps deploy history with one-click rollback in the dashboard. Workers don't ship with built-in rollback; for now, revert the offending PR and let the next deploy redeploy.
- Secret leakage detection — GitHub's native secret scanning catches common patterns. We don't add anything custom.
````

- [ ] **Step 2: Verify Prettier accepts the file**

```bash
pnpm exec prettier --check docs/operations/cloudflare-deploys.md
```

If it fails, run `pnpm exec prettier --write docs/operations/cloudflare-deploys.md` and re-check.

- [ ] **Step 3: Commit**

```bash
git add docs/operations/cloudflare-deploys.md
git commit -m "docs: add cloudflare deploys operations runbook"
```

---

### Task 2: Update root `CLAUDE.md` to link the runbook

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Edit `CLAUDE.md`**

Add a new top-level section just before "## Acknowledgements" (or wherever fits the existing structure):

```markdown
## Deploys

Workers and the SPA auto-deploy to Cloudflare on every merge to `main`. The runbook (token permissions, repo secrets, one-time setup, rotation) lives at [`docs/operations/cloudflare-deploys.md`](docs/operations/cloudflare-deploys.md).

The token uses **least-privilege** scoping — only the four permissions actually needed today (Workers Scripts edit, Workers KV edit, Pages edit, Account Settings read). Add more as features land per the runbook's "Future permissions" table.
```

(Use `Read` first to find the right insertion point. Place it after the existing "Releases & versioning" section.)

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: link cloudflare deploys runbook from root CLAUDE.md"
```

---

## Phase 2: GitHub Actions workflow

### Task 3: Create `.github/workflows/deploy.yml`

**Files:**

- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Create the workflow file** with EXACTLY:

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  data-proxy:
    name: Deploy data-proxy Worker
    runs-on: ubuntu-latest
    concurrency:
      group: deploy-data-proxy
      cancel-in-progress: false
    environment:
      name: production-data-proxy
      url: https://tarkov-data-proxy.workers.dev
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Build (verify bundle)
        run: pnpm --filter @tarkov/data-proxy build

      - name: Deploy
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: apps/data-proxy
          command: deploy

  builds-api:
    name: Deploy builds-api Worker
    runs-on: ubuntu-latest
    concurrency:
      group: deploy-builds-api
      cancel-in-progress: false
    environment:
      name: production-builds-api
      url: https://tarkov-builds-api.workers.dev
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Build (verify bundle)
        run: pnpm --filter @tarkov/builds-api build

      - name: Deploy
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: apps/builds-api
          command: deploy

  pages:
    name: Deploy web (Cloudflare Pages)
    runs-on: ubuntu-latest
    concurrency:
      group: deploy-pages
      cancel-in-progress: false
    environment:
      name: production-pages
      url: https://tarkov-web.pages.dev
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Build SPA
        run: pnpm --filter @tarkov/web build

      - name: Deploy
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: apps/web
          command: pages deploy ./dist --project-name=tarkov-web --branch=main
```

Notes baked in:

- `permissions: contents: read` — minimum needed; not granting `pull-requests: write` etc.
- Each job has its own `concurrency` group so a slow data-proxy deploy doesn't block builds-api.
- `cancel-in-progress: false` because we want every commit's deploy to land — not skip ahead.
- `environment:` blocks make Cloudflare URLs visible in the GitHub Deployments tab and let you optionally require approvals later (Settings → Environments → add reviewer).
- Each job runs `pnpm install --frozen-lockfile` independently. We could share a setup composite Action later; YAGNI for now.
- `workflow_dispatch:` makes manual re-deploys easy from the Actions tab.

- [ ] **Step 2: Verify the workflow YAML parses**

```bash
pnpm exec prettier --check .github/workflows/deploy.yml
```

If Prettier rewrites it, accept the rewrite.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add deploy workflow for workers + pages"
```

---

## Phase 3: Update per-package CLAUDE.mds

### Task 4: Update `apps/data-proxy/CLAUDE.md`

**Files:**

- Modify: `apps/data-proxy/CLAUDE.md`

- [ ] **Step 1: Replace the "Deploy (manual, for now)" section**

Find:

```markdown
## Deploy (manual, for now)
```

Replace that section heading and body through the next `##` with:

````markdown
## Deploy

Auto-deploys to Cloudflare Workers on every merge to `main` via [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml). Production URL: `https://tarkov-data-proxy.<your-subdomain>.workers.dev`.

Manual deploy (rare — for testing a fix locally before pushing):

```bash
wrangler login                                    # one-time
pnpm --filter @tarkov/data-proxy deploy           # wrangler deploy
pnpm --filter @tarkov/data-proxy tail             # live log stream
```
````

Token + secret setup is documented in [`docs/operations/cloudflare-deploys.md`](../../docs/operations/cloudflare-deploys.md).

````

- [ ] **Step 2: Commit**

```bash
git add apps/data-proxy/CLAUDE.md
git commit -m "docs(data-proxy): note CI auto-deploys are now live"
````

---

### Task 5: Update `apps/builds-api/CLAUDE.md`

**Files:**

- Modify: `apps/builds-api/CLAUDE.md`

- [ ] **Step 1: Replace the "First deploy" section**

Find:

```markdown
## First deploy
```

Replace through the next `##` with:

````markdown
## Deploy

Auto-deploys to Cloudflare Workers on every merge to `main` via [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml). Production URL: `https://tarkov-builds-api.<your-subdomain>.workers.dev`.

### One-time KV setup (before first deploy)

The KV namespace id in `wrangler.jsonc` is a placeholder. Before the first CI deploy succeeds:

```bash
wrangler login                                                   # one-time
pnpm --filter @tarkov/builds-api exec wrangler kv:namespace create BUILDS
# → prints { "id": "<real-id>" }; replace REPLACE_ON_FIRST_DEPLOY in wrangler.jsonc
```
````

KV namespace ids are opaque, NOT secret — commit the real id once and CI takes over.

Manual deploy (rare):

```bash
pnpm --filter @tarkov/builds-api deploy
pnpm --filter @tarkov/builds-api tail
```

Full setup runbook: [`docs/operations/cloudflare-deploys.md`](../../docs/operations/cloudflare-deploys.md).

````

- [ ] **Step 2: Commit**

```bash
git add apps/builds-api/CLAUDE.md
git commit -m "docs(builds-api): note CI auto-deploys + KV namespace setup"
````

---

### Task 6: Update `apps/web/CLAUDE.md`

**Files:**

- Modify: `apps/web/CLAUDE.md`

- [ ] **Step 1: Replace the "Deploy (manual, for now)" section**

Find:

```markdown
## Deploy (manual, for now)
```

Replace through the next `##` with:

````markdown
## Deploy

Auto-deploys to Cloudflare Pages on every merge to `main` via [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml). Production URL: `https://tarkov-web.pages.dev`.

The first CI deploy auto-creates the Pages project (`tarkov-web`). Manual deploy (rare):

```bash
wrangler login                              # one-time
pnpm --filter @tarkov/web build
pnpm --filter @tarkov/web pages:deploy
```
````

Full setup runbook: [`docs/operations/cloudflare-deploys.md`](../../docs/operations/cloudflare-deploys.md).

````

- [ ] **Step 2: Commit**

```bash
git add apps/web/CLAUDE.md
git commit -m "docs(web): note Pages CI auto-deploys are now live"
````

---

## Phase 4: Ship

### Task 7: Final verification + PR + merge + release

**Files:** none (operational)

- [ ] **Step 1: Verify all gates pass locally (no functional code changed; should be quick)**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
```

Expected: all exit 0.

- [ ] **Step 2: Push branch + open PR**

The branch name is `feat/ci-deploys`.

```bash
git push -u origin feat/ci-deploys
gh pr create --base main --head feat/ci-deploys --title "feat(ci): auto-deploy workers + pages on main merges" --body "Adds .github/workflows/deploy.yml with three parallel jobs (data-proxy, builds-api, pages). Each uses cloudflare/wrangler-action@v3.

Comprehensive runbook at docs/operations/cloudflare-deploys.md covers: API token spec (least-privilege — only 4 permissions today), required secrets, one-time KV + Pages project setup, future permissions to add as features land, rotation flow.

Workflow runs but each job fails with a clear error message until CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID secrets are present. CI on the rest of the repo is unaffected."
```

Capture the PR number.

- [ ] **Step 3: Wait for CI green explicitly**

```bash
sleep 8
RUN_ID=$(gh run list --repo UnderMyBed/TarkovGunsmith --branch feat/ci-deploys --workflow ci.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch $RUN_ID --repo UnderMyBed/TarkovGunsmith
gh run view $RUN_ID --repo UnderMyBed/TarkovGunsmith --json conclusion --jq '.conclusion'
```

Expected: `success`. (The deploy workflow will also fire — but it'll fail because secrets aren't set yet; that's expected and doesn't block the PR.)

- [ ] **Step 4: Squash-merge**

```bash
gh pr merge <pr-number> --repo UnderMyBed/TarkovGunsmith --squash --delete-branch
```

- [ ] **Step 5: Wait for release-please + auto-triggered CI**

```bash
sleep 15
gh pr list --repo UnderMyBed/TarkovGunsmith --state open
RUN_ID=$(gh run list --repo UnderMyBed/TarkovGunsmith --workflow ci.yml --branch release-please--branches--main--components--tarkov-gunsmith --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch $RUN_ID --repo UnderMyBed/TarkovGunsmith
gh run view $RUN_ID --repo UnderMyBed/TarkovGunsmith --json conclusion --jq '.conclusion'
```

Expected: `success`.

- [ ] **Step 6: Admin-merge release PR**

```bash
gh pr merge <release-pr-number> --repo UnderMyBed/TarkovGunsmith --squash --delete-branch --admin
```

Expected: `v0.8.0` tag and GitHub Release.

- [ ] **Step 7: Cleanup**

```bash
git switch main && git pull --ff-only
git branch -D feat/ci-deploys
git remote prune origin
```

(No worktree to remove since this plan can be done in the main checkout — no app code, just CI + docs.)

---

## Done — what's true after this plan

- `.github/workflows/deploy.yml` exists and runs on every push to `main`.
- `docs/operations/cloudflare-deploys.md` is the canonical runbook for token + secret + one-time setup.
- Per-package CLAUDE.mds for `apps/data-proxy`, `apps/builds-api`, and `apps/web` reflect that CI deploys are now active.
- Repo released as `v0.8.0`.
- **The workflow will fail until the user adds `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` repo secrets and does the one-time KV/Pages setup.** That's by design — the code change is independent of the manual ops setup, and the runbook is the user's checklist.

## What's NOT true yet (intentionally deferred)

- **No custom domain.** Workers live at `*.workers.dev`, Pages at `*.pages.dev`. Custom domain = follow-up plan + Workers Routes permission added to the token.
- **No staging environment.** Every main merge ships straight to production. Add `[env.staging]` blocks in each `wrangler.jsonc` + a `deploy-preview.yml` workflow when wanted.
- **No automated post-deploy smoke tests.** The Tier C playbook has a `deploy-verifier` agent — add when escalating to Tier C.
- **No Pages preview deploys per PR.** Cloudflare Pages can do this natively when the GitHub integration is enabled in the dashboard; we deliberately use `wrangler-action` instead so all deploy logic lives in this workflow file. If you want PR previews, enable the dashboard integration separately.
- **No DNS automation, no R2, no D1, no AI Gateway.** All in the runbook's "Future permissions" table.
