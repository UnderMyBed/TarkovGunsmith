# `@tarkov/builds-api`

Cloudflare Worker that backs the "share this build" feature. Saves arbitrary build JSON to KV under an 8-char nanoid; returns the id + URL. Reads come back as the original JSON (no validation here — apps/web validates with the current build schema).

## Endpoints

- `GET /healthz` → `200 ok`
- `POST /builds` → body is the build JSON (≤32KB). Returns `201 { id, url }` and writes to KV with `BUILD_TTL_SECONDS` TTL (default 30 days).
- `GET /builds/:id` → returns the JSON if it exists; `404` if expired/unknown; `400` if the id doesn't match `BUILD_ID_REGEX`.
- Anything else → `404`.

## Local dev

```bash
pnpm --filter @tarkov/builds-api dev    # wrangler dev → http://localhost:8787 (real KV simulated)
pnpm --filter @tarkov/builds-api test   # vitest in workerd, real KV per test
pnpm --filter @tarkov/builds-api build  # wrangler --dry-run --outdir dist
```

`wrangler dev` simulates the `BUILDS` KV namespace locally; values persist in `.wrangler/state/`.

## First deploy

The KV id in `wrangler.jsonc` is a placeholder. Before the first `wrangler deploy`:

```bash
wrangler login
wrangler kv:namespace create BUILDS         # prints { "id": "<real-id>" }
# replace REPLACE_ON_FIRST_DEPLOY in wrangler.jsonc with the printed id
pnpm --filter @tarkov/builds-api deploy
```

This is a one-time manual step; tracked as a follow-up so CI deploys can take over.

## Conventions

- Build values are stored opaquely under `b:<nanoid>` keys. We don't validate their shape here — that's the web app's job using the current build schema. We DO validate the id format (`BUILD_ID_REGEX`) before any KV op to bound key cardinality.
- `MAX_BODY_BYTES = 32 KB` — anyone posting bigger is doing something weird; reject early.
- `expirationTtl` is read from the env var so we can dial it without code changes.
- 100% coverage on logic files; `index.ts` covered by the fetch tests end-to-end.

## Out of scope

- Schema validation of build JSON — apps/web owns that.
- A delete endpoint — KV TTL handles cleanup. Users sharing rebuild via re-POST.
- A "pin" mode (long-TTL builds) — future feature; will need a write key/auth.
- Rate limiting — Cloudflare Turnstile or similar; future.
