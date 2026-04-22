# Local development

How to run the full TarkovGunsmith stack on your machine and how to manage env vars / secrets for both local dev and production.

## Quick start — fresh clone

```bash
git clone https://github.com/UnderMyBed/TarkovGunsmith.git
cd TarkovGunsmith
pnpm install

# Copy .dev.vars templates (see "Secrets & env vars" below for what each file does)
cp apps/builds-api/.dev.vars.example apps/builds-api/.dev.vars
cp apps/data-proxy/.dev.vars.example apps/data-proxy/.dev.vars
cp apps/web/.dev.vars.example apps/web/.dev.vars

pnpm dev        # starts web + both workers in one terminal

# In a second terminal:
pnpm seed:build # POSTs a fixture build to local builds-api; prints the share URL
```

Open the printed share URL (`http://localhost:5173/builder/<id>`) to confirm the full save/load round-trip works.

## What runs where

| Service                    | Port             | Started by                            | Notes                                                                                                                                            |
| -------------------------- | ---------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web` (Vite)          | `5173`           | `pnpm dev`                            | SPA. Proxies `/api/data/*` → `:8787`, `/api/builds/*` → `:8788`.                                                                                 |
| `apps/data-proxy`          | `8787`           | `pnpm dev`                            | GraphQL cache in front of `api.tarkov.dev`.                                                                                                      |
| `apps/builds-api`          | `8788`           | `pnpm dev`                            | KV-backed build save/load.                                                                                                                       |
| `apps/web` Pages Functions | `8789` (default) | `pnpm --filter @tarkov/web pages:dev` | Power-user escape hatch — needed to exercise `/og/build/:id`, `/og/pair/:pairId`, and `/functions/api/builds/*` locally. Not part of `pnpm dev`. |

Both Workers also open a devtools inspector: `data-proxy` on `9229`, `builds-api` on `9230` — pinned so the two processes don't collide on the shared default.

Ports are pinned in each app's `wrangler.jsonc` (`dev.port` + `dev.inspector_port`) and in `apps/web/vite.config.ts`. If you hit "port already in use," see "Troubleshooting" below.

## Secrets & env vars

Wrangler reads `.dev.vars` automatically during `wrangler dev` (Workers) and `wrangler pages dev` (Pages Functions). Values there override `wrangler.jsonc`'s `vars` block for the local dev session only.

### Committed templates (copy to `.dev.vars` to activate)

| File                                | Variable               | Purpose                                                                                         |
| ----------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------- |
| `apps/builds-api/.dev.vars.example` | `OG_FIXTURE_BUILD_ID`  | Set to a seeded build id to unlock `/og/build/:id` rendering in `wrangler pages dev`.           |
| `apps/builds-api/.dev.vars.example` | `OG_FIXTURE_PAIR_ID`   | Same, for pair OG cards.                                                                        |
| `apps/data-proxy/.dev.vars.example` | `UPSTREAM_GRAPHQL_URL` | Override the GraphQL endpoint (default `https://api.tarkov.dev/graphql`).                       |
| `apps/web/.dev.vars.example`        | `BUILDS_API_URL`       | Must be `http://localhost:8788` for Pages Functions `/api/builds/*` to proxy correctly locally. |

### Production secrets (set via wrangler, NOT committed)

| Variable         | Set via                                                                                                      | Used by                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| `BUILDS_API_URL` | `pnpm --filter @tarkov/web exec wrangler pages secret put BUILDS_API_URL --project-name tarkov-gunsmith-web` | `apps/web/functions/api/builds/[[path]].ts` |

**This is the one prod-only secret the runbook covers explicitly.** Without it, the production `/builder` save/load endpoint returns 500. To set it:

```bash
pnpm --filter @tarkov/web exec wrangler pages secret put BUILDS_API_URL --project-name tarkov-gunsmith-web
# Paste the production builds-api URL when prompted, e.g.:
# https://tarkov-gunsmith-builds-api.<your-subdomain>.workers.dev
```

Verify:

```bash
pnpm --filter @tarkov/web exec wrangler pages secret list --project-name tarkov-gunsmith-web
# Expected: BUILDS_API_URL appears in the list.
```

Rotate by running `wrangler pages secret put` again with a new value; the old value is overwritten atomically.

## Exercising save/load locally

The `pnpm seed:build` helper (see `scripts/seed-local-build.ts`) is the fastest path. It POSTs a zod-validated M4A1 fixture to `http://localhost:8788/builds` and prints:

```
✓ seeded build: abc12345
  share URL:    http://localhost:5173/builder/abc12345
  compare URL:  http://localhost:5173/builder/compare
```

If the fixture ever drifts from the current `Build` schema in `@tarkov/data`, the script fails loudly with the zod parse issues — update `scripts/fixtures/build-m4a1.json` to match.

For ad-hoc testing, POST directly:

```bash
curl -X POST http://localhost:8788/builds \
  -H 'content-type: application/json' \
  -d '{"schemaVersion":4,"weaponId":"...","slotAssignments":{}}'
# → {"id":"abc12345","url":"/builds/abc12345"}
```

## Exercising OG cards locally

The Pages Functions emulator is a separate process from `pnpm dev`:

```bash
# Terminal 1: seed a build and remember the id
pnpm --filter @tarkov/builds-api dev
pnpm seed:build   # copy the printed id

# Terminal 2: put that id into apps/builds-api/.dev.vars
echo "OG_FIXTURE_BUILD_ID=<paste-id-here>" >> apps/builds-api/.dev.vars
# (leave the OG_FIXTURE_PAIR_ID line too)

# Terminal 3: run the Pages emulator
pnpm --filter @tarkov/web build
pnpm --filter @tarkov/web pages:dev

# Visit http://localhost:8789/og/build/<id>
```

The Pages emulator reads `apps/web/.dev.vars` (for `BUILDS_API_URL`) and speaks to the builds-api Worker on :8788.

## Troubleshooting

- **"Port 8787 already in use"** — another wrangler instance is running. Find it with `lsof -i :8787` (macOS/Linux) or `netstat -ano | findstr 8787` (Windows) and kill it. Or restart `pnpm dev` after making sure no stray `wrangler dev` terminals are open.
- **`.dev.vars` changes not taking effect** — wrangler only reads `.dev.vars` at startup. Kill the dev server (Ctrl-C) and `pnpm dev` again.
- **Stale KV state in builds-api** — KV is simulated locally in `apps/builds-api/.wrangler/state/`. To reset:
  ```bash
  rm -rf apps/builds-api/.wrangler/state
  ```
- **`pnpm seed:build` fixture validation fails** — the Build schema changed. Update `scripts/fixtures/build-m4a1.json` to match `packages/tarkov-data/src/build-schema.ts`. The error output names the exact field that's off.
- **Fresh-install issues after pulling main** — `pnpm install --frozen-lockfile` from the repo root; if that complains, delete the root `node_modules` and retry.
- **Pages Functions return 500 on `pages:dev`** — `apps/web/.dev.vars` is missing or doesn't have `BUILDS_API_URL=http://localhost:8788`. Copy from `.dev.vars.example`.

## Deeper references

- Full deploy runbook (tokens, KV setup, Pages project): [`docs/operations/cloudflare-deploys.md`](./cloudflare-deploys.md)
- Per-app local-dev notes: [`apps/builds-api/CLAUDE.md`](../../apps/builds-api/CLAUDE.md), [`apps/data-proxy/CLAUDE.md`](../../apps/data-proxy/CLAUDE.md), [`apps/web/CLAUDE.md`](../../apps/web/CLAUDE.md)
- Build schema: [`packages/tarkov-data/src/build-schema.ts`](../../packages/tarkov-data/src/build-schema.ts)
