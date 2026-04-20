# Playwright Smoke Tests + CI Gate

**Status:** design approved 2026-04-20 · urgent process fix.
**Depends on:** `apps/web` Vite build pipeline.
**Part of:** M3 process — unblocks trust in the deployment pipeline before shipping remaining M3 differentiators.

## 1. Context

M1 through M3 shipped with "visual walkthrough deferred to post-merge" noted in every PR body — and none of those walkthroughs happened in practice. The consequence: a latent font-loading bug shipped to production and survived five M3 PRs (Google Fonts `@import` silently stripped by Lightning CSS → every font fell back to system defaults, nullifying the Field Ledger aesthetic until the fix in PR #69). Meanwhile a separate runtime error on the Builder remains undiagnosed because no CI step opens a browser.

Green CI has been a proxy for correctness, not evidence of it. This spec fixes that by adding Playwright smoke tests that run headless on every PR, specifically designed to catch:

- Routes that throw on load.
- Console errors / unhandled promise rejections.
- Fonts that don't load (would have caught the M3 latent bug directly).
- Top-level components that fail to render.

Intentionally NOT in scope v1: full feature coverage, screenshot visual regression, cross-browser matrix. This is a **smoke-level gate** — fast, stable, catches obvious brokenness.

## 2. Goals

- **Every route smoke-tested** on every PR, in CI.
- **Console errors fail the build.** No "warnings" acceptable at the console level during a page load.
- **Font load verified.** Specifically: a known text element has a computed `font-family` that includes "Bungee" (or our other chosen display font, if the direction changes).
- **Fast feedback.** Whole suite under 60s wall-clock.
- **Same command locally and in CI.** `pnpm --filter @tarkov/web test:e2e`.

## 3. Non-goals

- Screenshot / visual regression — flaky, heavyweight, not justified at this stage.
- Cross-browser matrix (Firefox / WebKit / mobile). Chromium only for v1.
- Full user-journey tests (save-build-then-load, complete a scenario, etc.). Those grow per feature.
- Replacing Vitest. Vitest stays for unit + pure-logic tests.

## 4. Architecture

```
apps/web/
├── playwright.config.ts           NEW — config
├── e2e/
│   ├── smoke.spec.ts              NEW — per-route smoke tests + console-error + font-load check
│   └── tsconfig.json              NEW — tsconfig scoping e2e to its own project
├── package.json                   MODIFIED — @playwright/test dep + test:e2e script
└── CLAUDE.md                      MODIFIED — note Playwright conventions

.github/workflows/ci.yml           MODIFIED — install Chromium + run e2e as part of the existing "CI" job
CLAUDE.md (root)                   MODIFIED — hard rule: feature PRs must include e2e coverage for any new route
```

### 4.1 Config

- **Test mode:** `npx playwright test` drives a `preview` build (fast, deterministic). Playwright's `webServer` config starts `pnpm --filter @tarkov/web preview` on port 4173, waits for 200 on `/`, then runs tests.
- **Build prereq:** CI step runs `pnpm build` before `test:e2e`. Locally the `test:e2e` script can assume the user ran build first, or we can chain it in the script.
- **Browser:** Chromium only (Playwright default, smallest install).

### 4.2 Console-error strategy

Each test uses Playwright's `page.on('console', ...)` listener. Any `type === 'error'` event during navigation fails the test with a helpful message. Exempted: zero known noisy strings for now; if we add any, document them in the spec as an explicit allowlist.

### 4.3 Font-load check

One test loads `/`, waits for `document.fonts.ready`, and asserts that the computed `font-family` on an H1 in the Bungee stack resolves to an actually-loaded face. Use `document.fonts.check("1em Bungee")` for definitive verification. The test's failure message cites the M3 regression as rationale.

### 4.4 Per-route smokes

Routes: `/`, `/builder`, `/calc`, `/matrix`, `/sim`, `/adc`, `/aec`, `/data`, `/charts`.

For each: load, assert no console errors during load, assert an expected key text/element is visible. Tests live in a single `smoke.spec.ts` with a `test.describe.parallel` block.

### 4.5 Policy going forward

Root `CLAUDE.md` gains a "Testing discipline" line:

> Every feature PR either keeps existing routes green or adds new coverage in `apps/web/e2e/`. "Visual walkthrough deferred" is no longer acceptable — if you can't verify it, you can't ship it.

## 5. Testing the tests

- Run locally: `pnpm --filter @tarkov/web build && pnpm --filter @tarkov/web test:e2e`. Expected: all green.
- Deliberately break one route (e.g., throw in `/calc`'s render) and confirm the smoke test catches it. (Revert after verification.)
- Remove the `<link>` to Google Fonts and confirm the font-load test fails. (Revert.)

## 6. Risks

- **Install time.** `playwright install --with-deps chromium` in CI adds ~30–60s per run. Use Playwright's Docker image or GitHub's `actions/cache` for the browsers directory to keep this bounded. v1 accepts the cost; optimize later.
- **Flaky dev-server startup.** `preview` is more stable than `dev`. If startup is slow, Playwright's `webServer.timeout` handles it. Bump to 120s if needed.
- **GraphQL network dependency.** Routes like `/builder` hit `api.tarkov.dev`. If the upstream is down during CI, tests fail through no fault of ours. Mitigation: the smokes should tolerate `isLoading` states — assert "page loaded" by finding an always-present header element, not data-dependent content.
- **First-render console errors from TanStack Query.** Hydration warnings during initial render could trip the console-error guard. If they appear, allowlist the specific known-safe string + document.

## 7. Known follow-ups

- Visual regression (screenshot diffs) — only if flakiness stays low and we want to catch styling regressions. Not this PR.
- Cross-browser matrix.
- Per-feature e2e tests (not just smokes) — land alongside new features as they ship.
- Preview deploys tied to PR branches (Cloudflare Pages supports this) — tests could run against real preview URLs in addition to the local preview.
