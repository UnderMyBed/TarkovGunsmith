# Cloudflare Deploys — Operations Runbook

How CI auto-deploys the Workers and the SPA, what the API token needs to be allowed to do, and what one-time manual setup is required.

## Architecture

`.github/workflows/deploy.yml` runs three parallel jobs on every push to `main`:

| Job          | Deploys                            | Wrangler invocation                                               |
| ------------ | ---------------------------------- | ----------------------------------------------------------------- |
| `data-proxy` | `apps/data-proxy` Worker           | `wrangler deploy` (from `apps/data-proxy/`)                       |
| `builds-api` | `apps/builds-api` Worker (uses KV) | `wrangler deploy` (from `apps/builds-api/`)                       |
| `pages`      | `apps/web` (Vite build output)     | `wrangler pages deploy ./dist --project-name=tarkov-gunsmith-web` |

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

### Where wrangler lives

Wrangler is installed per-Worker in this monorepo (each `apps/*` has it as a devDep). It's NOT on your shell PATH globally. Invoke via the workspace:

```bash
pnpm --filter @tarkov/builds-api exec wrangler <command>
pnpm --filter @tarkov/data-proxy exec wrangler <command>
pnpm --filter @tarkov/web exec wrangler <command>
```

`pnpm --filter <pkg> exec` runs the binary from that package's `node_modules/.bin/`. This pins each Worker to its own Wrangler version and avoids "which wrangler am I running?" confusion. `wrangler login` from any of those works for all of them (auth is stored in `~/.config/.wrangler/`).

### 1. Create the `BUILDS` KV namespace

```bash
pnpm --filter @tarkov/builds-api exec wrangler kv:namespace create BUILDS
# → prints { "binding": "BUILDS", "id": "abc123def456..." }
```

Replace `"id": "REPLACE_ON_FIRST_DEPLOY"` in `apps/builds-api/wrangler.jsonc` with the printed `id`. Commit. KV namespace ids are opaque and NOT secret — committing them is the standard pattern.

### 2. Create the Pages project (or let `wrangler pages deploy` auto-create on first run)

```bash
pnpm --filter @tarkov/web exec wrangler pages project create tarkov-gunsmith-web --production-branch=main
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

- `https://tarkov-gunsmith-data-proxy.<your-subdomain>.workers.dev/healthz` → `ok`
- `https://tarkov-gunsmith-builds-api.<your-subdomain>.workers.dev/healthz` → `ok`
- `https://tarkov-gunsmith-web.pages.dev` → the SPA's landing page

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
