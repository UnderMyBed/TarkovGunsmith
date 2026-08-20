# `@tarkov/web`

Vite + React SPA. Deploys to Cloudflare Pages. Consumes all four `packages/*` and (eventually) both `apps/*` Workers.

## What's in this package

- `src/main.tsx` — entry point, renders `<App />`.
- `src/app.tsx` — provider stack: `<QueryClientProvider>` → `<TarkovDataProvider>` → `<RouterProvider>`.
- `src/router.ts` — TanStack Router instance built from the auto-generated route tree.
- `src/route-tree.gen.ts` — **generated** by `@tanstack/router-plugin/vite` whenever `src/routes/` changes. Do NOT edit by hand.
- `src/routes/` — file-based routes (TanStack Router conventions: `__root.tsx`, `index.tsx`, etc.).
- `src/tarkov-client.ts` — the default `json.tarkov.dev` client instance the SPA uses.
- `src/styles.css` — `@import "@tarkov/ui/styles.css"` plus any app-specific styles. It also carries `@source not` directives for this app's test files and Playwright specs: Tailwind's auto-detection walks the Vite root, so without them a class named in an assertion string emits a real production rule.
- `src/styles.test.ts` — compiles the stylesheet in memory and asserts every `@tarkov/ui` primitive's classes have a matching rule. Regression guard for GitHub issue #162.

## Local dev

```bash
pnpm --filter @tarkov/web dev          # vite on http://localhost:5173
pnpm --filter @tarkov/web test         # vitest in node env
pnpm --filter @tarkov/web build        # tsc --noEmit + vite build → dist/
pnpm --filter @tarkov/web preview      # serve dist/ on http://localhost:4173
pnpm --filter @tarkov/web pages:dev    # wrangler pages dev (Pages emulator)
pnpm --filter @tarkov/web pages:deploy # wrangler pages deploy (manual deploy after `wrangler login`)
```

The SPA hits `https://json.tarkov.dev/regular/` directly (CORS is enabled upstream). The GraphQL API this project was built on went down in July 2026; see [ADR-0002](../../docs/adr/0002-json-api-migration.md). The Vite `server.proxy` config routes `/api/builds/*` → `localhost:8788` (builds-api).

## Deploy

Auto-deploys to Cloudflare Pages on every merge to `main` via [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml). Production URL: `https://tarkov-gunsmith-web.pages.dev`.

The first CI deploy auto-creates the Pages project (`tarkov-gunsmith-web`). Manual deploy (rare):

```bash
wrangler login                              # one-time
pnpm --filter @tarkov/web build
pnpm --filter @tarkov/web pages:deploy
```

Full setup runbook: [`docs/operations/cloudflare-deploys.md`](../../docs/operations/cloudflare-deploys.md).

### Env vars on Cloudflare Pages

- `BUILDS_API_URL` (required in production) — URL of the `apps/builds-api` Worker (e.g. `https://tarkov-gunsmith-builds-api.<subdomain>.workers.dev`). Used by `apps/web/functions/api/builds/[[path]].ts` to proxy build save/load requests same-origin.
- Locally, set `BUILDS_API_URL=http://localhost:8788` in `apps/web/.dev.vars` (copy from `.dev.vars.example`) so `wrangler pages dev` can exercise the Pages Functions.

Production setup + verification + rotation commands live in [`docs/operations/local-development.md`](../../docs/operations/local-development.md#production-secrets-set-via-wrangler-not-committed).

## Conventions

- **File-based routes only.** Files in `src/routes/` become routes. The plugin generates `route-tree.gen.ts` automatically.
- **Page components get a route file.** A new feature (e.g. `/calc`) gets `src/routes/calc.tsx` with the route definition + page component inline, OR delegates to `src/features/<name>/`.
- **Data via `@tarkov/data` hooks.** Never call `fetch` or the JSON API directly from a route file.
- **UI via `@tarkov/ui` primitives.** Shadcn-CLI inline if a primitive isn't there yet, then extract upstream in a follow-up.
- **`src/route-tree.gen.ts` is generated.** Excluded from coverage, formatting will rewrite it as needed.

## E2E tests (Playwright)

Smoke-level Chromium tests live at `apps/web/e2e/`. Run:

- `pnpm --filter @tarkov/web test:e2e:install` — first-time browser install.
- `pnpm --filter @tarkov/web build` — **required before the line below.** Playwright's `webServer` runs `wrangler pages dev dist`, which serves the built output; a stale or absent `dist/` produces a 120s timeout and 404s on every request, not a missing-build error.
- `pnpm --filter @tarkov/web test:e2e` — run the suite.

Playwright starts three webServers: `wrangler pages dev dist` on 4173, the builds-api Worker on 8787, and `e2e/upstream-fixture-server.ts` on 8790. CI runs the suite as part of the `Typecheck • Lint • Format • Test` job after build. Every route must be represented in `ROUTES` inside `smoke.spec.ts`. Any new route added to `__root.tsx` nav must also be added there.

**No spec may depend on a live third party.** Game data is served from the captures in `packages/tarkov-data/src/__fixtures__/`, not from `json.tarkov.dev`:

- Import `test` / `expect` from `./upstream.js`, never from `@playwright/test`. That module intercepts the browser's upstream calls, stubs the `assets.tarkov.dev` image CDN, and **fails the test** on any other live host the page reaches, naming the URL.
- The OG Pages Functions fetch upstream server-side, where `page.route` can't reach them; they read the fixture server instead via the `TARKOV_JSON_API_BASE` binding set in `playwright.config.ts`.
- Google Fonts is the one allowed live host — the font tests below assert the real `<link>` resolves.
- Because the data is fixed, assertions are exact. `expect(rows).toBeGreaterThan(50)` against whatever upstream shipped that morning is not a contract; derive the number from the capture (`fixtureItemCount`) or from the shared constants in `upstream.ts`.

Live-upstream drift is checked separately by `pnpm verify:upstream`, on a schedule — `.github/workflows/upstream-contract.yml`, deliberately not in CI.

Fonts are guarded by a separate test using `document.fonts.check("1em <Family>")`. If you change the font stack, update that test.

## Out of scope (deferred to follow-up plans / Milestone 1)

- The three killer features (Calc, Matrix, Builder) — Milestone 1.
- Auth, build sharing UI, more `@tarkov/ui` primitives.
