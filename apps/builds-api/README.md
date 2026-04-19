# @tarkov/builds-api

Cloudflare Worker — KV-backed short-URL build sharing.

## Run locally

```bash
pnpm --filter @tarkov/builds-api dev
curl -s -X POST http://localhost:8787/builds \
  -H "Content-Type: application/json" \
  -d '{"weapon":{"id":"m4a1"},"mods":[]}' | jq .                  # → {"id":"...", "url":"..."}
curl -s http://localhost:8787/builds/<id> | jq .                  # → the build
```

See [`CLAUDE.md`](./CLAUDE.md) for conventions and first-deploy steps.
