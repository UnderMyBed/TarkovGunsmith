# `@tarkov/web`

Vite + React SPA. Deploys to Cloudflare Pages. Consumes all four `packages/*` and (eventually) both `apps/*` Workers.

## What's in this package

- `src/main.tsx` — entry point, renders `<App />`.
- `src/app.tsx` — provider stack: `<QueryClientProvider>` → `<TarkovDataProvider>` → `<RouterProvider>`.
- `src/router.ts` — TanStack Router instance built from the auto-generated route tree.
- `src/route-tree.gen.ts` — **generated** by `@tanstack/router-plugin/vite` whenever `src/routes/` changes. Do NOT edit by hand.
- `src/routes/` — file-based routes (TanStack Router conventions: `__root.tsx`, `index.tsx`, etc.).
- `src/tarkov-client.ts` — the default GraphQL client instance the SPA uses.
- `src/styles.css` — `@import "@tarkov/ui/styles.css"` plus any app-specific styles.

## Local dev

```bash
pnpm --filter @tarkov/web dev          # vite on http://localhost:5173
pnpm --filter @tarkov/web test         # vitest in node env
pnpm --filter @tarkov/web build        # tsc --noEmit + vite build → dist/
pnpm --filter @tarkov/web preview      # serve dist/ on http://localhost:4173
pnpm --filter @tarkov/web pages:dev    # wrangler pages dev (Pages emulator)
pnpm --filter @tarkov/web pages:deploy # wrangler pages deploy (manual deploy after `wrangler login`)
```

In v0.7.0 the SPA hits `https://api.tarkov.dev/graphql` directly (CORS is enabled upstream). The Vite `server.proxy` config is wired for `/api/data/*` → `localhost:8787` (data-proxy) and `/api/builds/*` → `localhost:8788` (builds-api), unused until a follow-up plan switches the endpoint.

## Deploy

Auto-deploys to Cloudflare Pages on every merge to `main` via [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml). Production URL: `https://tarkov-gunsmith-web.pages.dev`.

The first CI deploy auto-creates the Pages project (`tarkov-gunsmith-web`). Manual deploy (rare):

```bash
wrangler login                              # one-time
pnpm --filter @tarkov/web build
pnpm --filter @tarkov/web pages:deploy
```

Full setup runbook: [`docs/operations/cloudflare-deploys.md`](../../docs/operations/cloudflare-deploys.md).

## Conventions

- **File-based routes only.** Files in `src/routes/` become routes. The plugin generates `route-tree.gen.ts` automatically.
- **Page components get a route file.** A new feature (e.g. `/calc`) gets `src/routes/calc.tsx` with the route definition + page component inline, OR delegates to `src/features/<name>/`.
- **Data via `@tarkov/data` hooks.** Never call GraphQL or `fetch` directly from a route file.
- **UI via `@tarkov/ui` primitives.** Shadcn-CLI inline if a primitive isn't there yet, then extract upstream in a follow-up.
- **`src/route-tree.gen.ts` is generated.** Excluded from coverage, formatting will rewrite it as needed.

## Out of scope (deferred to follow-up plans / Milestone 1)

- The three killer features (Calc, Matrix, Builder) — Milestone 1.
- Playwright e2e — when there are interactive features worth testing.
- The `@tarkov/data-proxy` integration in prod — separate plan once CI deploys + Pages routing land.
- Auth, build sharing UI, more `@tarkov/ui` primitives.
