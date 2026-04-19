# `@tarkov/data-proxy`

Cloudflare Worker that fronts `api.tarkov.dev/graphql` with edge caching. The SPA points at this Worker (same-origin via Pages → Workers binding) instead of hitting tarkov-api directly, keeping latency low and reducing upstream load.

## Endpoints

- `GET /healthz` → `200 ok`
- `POST /graphql` → forwards to `UPSTREAM_GRAPHQL_URL`, caches the response keyed on `(query, variables, operationName)` for 60s. Sets `X-Cache: HIT|MISS`.
- Anything else → `404`.

## Local dev

```bash
pnpm --filter @tarkov/data-proxy dev    # wrangler dev → http://localhost:8787
pnpm --filter @tarkov/data-proxy test   # vitest in workerd, real Cache API
pnpm --filter @tarkov/data-proxy build  # wrangler --dry-run --outdir dist (no deploy)
```

`wrangler dev` simulates Cache API + bindings locally; state persists in `.wrangler/state/`. Use `wrangler dev --remote` to test against real Cloudflare resources before a production deploy.

## Deploy

Auto-deploys to Cloudflare Workers on every merge to `main` via [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml). Production URL: `https://tarkov-data-proxy.<your-subdomain>.workers.dev`.

Manual deploy (rare — for testing a fix locally before pushing):

```bash
wrangler login                                    # one-time
pnpm --filter @tarkov/data-proxy deploy           # wrangler deploy
pnpm --filter @tarkov/data-proxy tail             # live log stream
```

Token + secret setup is documented in [`docs/operations/cloudflare-deploys.md`](../../docs/operations/cloudflare-deploys.md).

## Conventions

- Logic-bearing helpers go in their own files (e.g. `cache-key.ts`); test them directly.
- The fetch handler in `index.ts` is the routing shell — keep it thin, delegate to handlers.
- 100% coverage on logic files; `index.ts` is excluded from coverage thresholds (the fetch tests cover its behavior end-to-end).
- Use `caches.default` (Cache API), not Workers KV, for the GraphQL proxy. Cache API is the right tool for response caching by request URL.

## Out of scope

- The `builds-api` Worker — that's `apps/builds-api`.
- A bespoke caching service (`the-hideout/cache`) — we use the built-in Cache API.
- Schema-aware caching (per-field TTLs, etc.) — current implementation caches whole responses.
