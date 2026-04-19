# @tarkov/data-proxy

Cloudflare Worker — GraphQL cache layer in front of `api.tarkov.dev`.

## Run locally

```bash
pnpm --filter @tarkov/data-proxy dev
curl -s http://localhost:8787/healthz                                       # → ok
curl -s -X POST http://localhost:8787/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __typename }"}' | jq .                                    # cached after first call
```

See [`CLAUDE.md`](./CLAUDE.md) for conventions.
