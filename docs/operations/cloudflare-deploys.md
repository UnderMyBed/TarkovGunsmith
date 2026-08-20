# Cloudflare Deploys — Operations Runbook

How CI auto-deploys the Workers and the SPA, what the API token needs to be allowed to do, and what one-time manual setup is required.

## Architecture

`.github/workflows/deploy.yml` runs on a push to `main` whose head commit starts with
`chore(main): release`, and on `workflow_dispatch`:

| Job          | Deploys                            | Wrangler invocation                                               |
| ------------ | ---------------------------------- | ----------------------------------------------------------------- |
| `builds-api` | `apps/builds-api` Worker (uses KV) | `wrangler deploy` (from `apps/builds-api/`)                       |
| `pages`      | `apps/web` (Vite build output)     | `wrangler pages deploy ./dist --project-name=tarkov-gunsmith-web` |
| `smoke`      | nothing — verifies the other two   | `curl` against the live hostnames                                 |

`smoke` runs after both deploys and fails the workflow if production is not actually serving.
Its load-bearing probe is `POST /api/builds` with an invalid body, which must return **400**:
that proves the request reached the Worker and was rejected by it. A **500** means the edge
could not reach the Worker at all — the failure that left build sharing dead in production for
months while every gate stayed green.

## Hostnames

| Host                                | Serves                               | Declared in                                          |
| ----------------------------------- | ------------------------------------ | ---------------------------------------------------- |
| `tarkovgunsmith.undermybed.dev`     | Pages — SPA, `/api/*` proxy, `/og/*` | `deploy.yml` "Ensure the Pages custom domain exists" |
| `api.tarkovgunsmith.undermybed.dev` | the `builds-api` Worker + KV         | `apps/builds-api/wrangler.jsonc` `routes[]`          |

Both records are created and owned by the deploy, not by hand in the dashboard. That is
deliberate: the Worker previously had neither `routes` nor `workers_dev` in its config, so when
its route disappeared nothing in the repo could restore it, and nothing recorded that it was
ever supposed to exist.

The browser never talks to the Worker directly — it calls `/api/builds` same-origin and the
Pages Function proxies it. That is why `api.tarkovgunsmith.undermybed.dev` does **not** appear
in the `connect-src` of `apps/web/public/_headers`.

`apps/web/functions/lib/builds-api.ts` defaults to the Worker's hostname when `BUILDS_API_URL`
is unset, so a missing binding degrades to "correct" rather than to a 500.
`packages/repo-guards/src/builds-api-host.test.ts` asserts that default and the `wrangler.jsonc`
route still name the same host.

All jobs use [`cloudflare/wrangler-action@v3`](https://github.com/cloudflare/wrangler-action) for auth + dispatch. Concurrency is grouped per job so two rapid merges queue cleanly.

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

| Scope       | Permission         | Access | Why                                                             |
| ----------- | ------------------ | ------ | --------------------------------------------------------------- |
| **Account** | Workers Scripts    | Edit   | `wrangler deploy` for `builds-api`                              |
| **Account** | Workers KV Storage | Edit   | Read/write the `BUILDS` namespace from the `builds-api` Worker  |
| **Account** | Cloudflare Pages   | Edit   | `wrangler pages deploy` for `apps/web`                          |
| **Account** | Account Settings   | Read   | Wrangler validates the token against the account on startup     |
| **Zone**    | Workers Routes     | Edit   | Create the Worker's `api.` custom domain from `wrangler.jsonc`  |
| **Zone**    | DNS                | Edit   | Create the DNS record the site's custom domain resolves through |
| **Zone**    | Zone               | Read   | Look up the zone id before writing a DNS record                 |

### Account resources

**Include:** Specific account → your account only. Do NOT grant "All accounts".

### Zone resources

**Include:** the `undermybed.dev` zone.

> **Workers Routes is a Zone permission, not an Account one.** It sits under **Zone** in the
> token editor alongside DNS. Granting it at the account level looks right and fails at
> deploy time with `A request to the Cloudflare API (/zones/<id>/workers/routes) failed.
Authentication error [code: 10000]`.
> Required for the two custom domains above —
> `wrangler deploy` creates the Worker's DNS record, and the Pages domain step creates the site's.

### Client IP filtering

**None.** Restrict to GitHub Actions IP ranges if you want belt-and-suspenders; not necessary for token security.

### TTL

**1 year**, then rotate. Calendar a reminder.

## Future permissions — add when each feature lands

The token never needs to be deleted — just expanded as the project grows. Edit the existing token at the same dashboard URL and click **Add Permission**.

| When you add…                                        | Add this permission                          |
| ---------------------------------------------------- | -------------------------------------------- |
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

- `https://tarkov-gunsmith-builds-api.<your-subdomain>.workers.dev/healthz` → `ok`
- `https://tarkov-gunsmith-web.pages.dev` → the SPA's landing page

## Rotating the token

1. Create a new token at the same dashboard URL with the same permissions.
2. Update the `CLOUDFLARE_API_TOKEN` repo secret (the value, not the name).
3. Push any commit to `main` to verify deploy still works.
4. Revoke the old token in the dashboard.

## What this runbook does NOT cover

- Multi-environment deploys (preview vs. production) — current setup deploys directly to production on every main merge. Add a `staging` environment in `wrangler.jsonc` + a separate `deploy-preview.yml` if/when that's wanted.
- Rollback — Cloudflare Pages keeps deploy history with one-click rollback in the dashboard. Workers don't ship with built-in rollback; for now, revert the offending PR and let the next deploy redeploy.
- Secret leakage detection — GitHub's native secret scanning catches common patterns. We don't add anything custom.
