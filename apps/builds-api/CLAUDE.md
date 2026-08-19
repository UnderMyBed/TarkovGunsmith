# `@tarkov/builds-api`

Cloudflare Worker that backs the "share this build" and "share this comparison" features. Validates and saves build/pair JSON to KV under an 8-char nanoid; returns the id + URL.

Every write-performing route (`POST /builds`, `POST /pairs`, `POST /pairs/:id/fork`) is Zod-validated against `@tarkov/data`'s `Build`/`BuildPair` schemas (`POST /pairs/:id/fork` copies an already-validated stored value, so it skips re-validation but still enforces the rate limit below) and rate-limited per `CF-Connecting-IP`. See `src/validation.ts` and `src/rate-limit.ts` for the full reasoning — the short version: KV's free tier allows only 1,000 writes/day account-wide, and both exist to keep one client from exhausting that for everyone.

## Endpoints

- `GET /healthz` → `200 ok`
- `POST /builds` → body is a `Build`-shaped JSON document (≤32KB). `400` if it fails JSON parsing or schema validation; `429` (with `Retry-After`) if the caller's IP is over its daily write budget. Otherwise returns `201 { id, url }` and writes to KV with `BUILD_TTL_SECONDS` TTL (default 30 days).
- `GET /builds/:id` → returns the JSON if it exists; `404` if expired/unknown; `400` if the id doesn't match `BUILD_ID_REGEX`.
- `POST /pairs` → body is a `BuildPair`-shaped JSON document (≤32KB). Same `400`/`429`/`201` shape as `POST /builds`, validated against `BuildPair` instead.
- `GET /pairs/:id` → same contract as `GET /builds/:id`, under the `p:` key prefix.
- `POST /pairs/:id/fork` → copies an existing pair to a fresh id. `404` if the source is missing, `400` on a malformed id, `429` if the caller's IP is over budget (shares the same daily counter as `POST /builds` and `POST /pairs` — see `src/rate-limit.ts`).
- Anything else → `404`.

## Local dev

```bash
pnpm --filter @tarkov/builds-api dev    # wrangler dev → http://localhost:8788 (real KV simulated)
pnpm --filter @tarkov/builds-api test   # vitest in workerd, real KV per test
pnpm --filter @tarkov/builds-api build  # wrangler --dry-run --outdir dist
```

`wrangler dev` simulates the `BUILDS` KV namespace locally; values persist in `.wrangler/state/`.

Copy `.dev.vars.example` → `.dev.vars` to override env vars for local runs (e.g. `OG_FIXTURE_BUILD_ID` for OG-card local testing).

Full local-dev workflow (full stack in one terminal, seed-build helper, troubleshooting): [`docs/operations/local-development.md`](../../docs/operations/local-development.md).

## Deploy

Auto-deploys to Cloudflare Workers on every merge to `main` via [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml). Production URL: `https://tarkov-gunsmith-builds-api.<your-subdomain>.workers.dev`.

### One-time KV setup (before first deploy)

The KV namespace id in `wrangler.jsonc` is a placeholder. Before the first CI deploy succeeds:

```bash
wrangler login                                                   # one-time
pnpm --filter @tarkov/builds-api exec wrangler kv:namespace create BUILDS
# → prints { "id": "<real-id>" }; replace REPLACE_ON_FIRST_DEPLOY in wrangler.jsonc
```

KV namespace ids are opaque, NOT secret — commit the real id once and CI takes over.

Manual deploy (rare):

```bash
pnpm --filter @tarkov/builds-api deploy
pnpm --filter @tarkov/builds-api tail
```

Full setup runbook: [`docs/operations/cloudflare-deploys.md`](../../docs/operations/cloudflare-deploys.md).

## Conventions

- Build/pair values are stored under `b:<nanoid>` / `p:<nanoid>` keys, validated on the way in against the same `Build`/`BuildPair` Zod schemas apps/web uses to parse them back out (`@tarkov/data`). We DO validate the id format (`BUILD_ID_REGEX`) before any KV op to bound key cardinality.
- Stored values are the _parsed and re-serialized_ schema output (`JSON.stringify(validation.data)`), not the raw request bytes — this materializes any Zod `.default()`s (e.g. `PlayerProfile.level`) the same way a load-then-resave would, and matches what a GET's own `Build.safeParse`/`BuildPair.safeParse` on the way out will produce.
- `MAX_BODY_BYTES = 32 KB` — anyone posting bigger is doing something weird; reject early, before parsing or validation.
- `expirationTtl` is read from the env var so we can dial it without code changes.
- Rate limiting (`src/rate-limit.ts`) is a per-IP-per-UTC-day KV counter, not Cloudflare's native Rate Limiting binding — the binding's `period` is capped at 10 or 60 seconds, which can't express a daily budget, and this project is a hard $0/mo commitment with no confirmed free-plan availability for that binding. The counter is deliberately structured so a flood of _rejected_ requests costs reads only, never writes — see the module comment for the full reasoning.
- 100% coverage on logic files; `index.ts` covered by the fetch tests end-to-end. `apps/builds-api` overall has no coverage _measurement_ (see `vitest.config.ts`) but its 48 tests (up from 29) all run in CI via `vitest run`.

## Out of scope

- A delete endpoint — KV TTL handles cleanup. Users sharing rebuild via re-POST.
- A "pin" mode (long-TTL builds) — future feature; will need a write key/auth.
- Auth / write keys — the rate limiter raises the bar against casual abuse but doesn't authenticate anyone; that's still a future feature if it's ever needed.
