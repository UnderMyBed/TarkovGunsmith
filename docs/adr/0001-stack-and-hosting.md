# ADR-0001: Stack and Hosting

**Date:** 2026-04-18
**Status:** Accepted
**Supersedes:** N/A
**Superseded by:** N/A

## Context

We are rebuilding the defunct TarkovGunsmith site. Constraints: must be hostable on a free tier indefinitely; must be developable with Claude as the primary collaborator; must improve on the original's architecture (C# .NET backend + CRA frontend).

## Decision

- **Frontend:** Vite + React + TypeScript SPA, deployed to Cloudflare Pages.
- **Edge backend:** Two Cloudflare Workers — `data-proxy` (GraphQL cache layer to `api.tarkov.dev`) and `builds-api` (KV-backed short-URL build sharing).
- **Data source:** community-run [`api.tarkov.dev`](https://api.tarkov.dev) GraphQL API. We do not host our own data.
- **Math engine:** pure-TypeScript package (`packages/ballistics`), runs client-side.
- **UI:** Tailwind v4 + shadcn/ui, dark-first.
- **Monorepo:** pnpm workspaces + Turborepo.
- **Routing/data:** TanStack Router + TanStack Query + `graphql-request` + Zod.
- **Tests:** Vitest + Playwright + `@cloudflare/vitest-pool-workers`.

## Consequences

**Positive:**

- $0/mo hosting indefinitely.
- Zero cold-start (Workers + edge static assets).
- AI-friendly stack: React + Vite + TS is the most-trodden path in current model training data, so first-shot generations are more correct.
- The math engine is a pure function of its inputs → trivially testable.
- No CORS overhead (SPA calls Workers same-origin via Pages bindings).

**Negative:**

- No SSR out of the box. If we ever need it for OG cards or SEO, we either selectively pre-render via `vite-plugin-ssr` or migrate the relevant routes to a different framework. Acceptable trade-off given app shape (calculators, not content).
- Free tier limits (Workers requests/day, KV ops/day) are generous but real. We monitor and add caching layers as needed.
- Two Workers + a SPA = three deployable units. Slightly more ops overhead than a single Next.js app, but cleaner separation.

## Alternatives considered

- **Next.js 15 App Router** — too heavy for a calculator app; RSC + edge runtime has sharp edges that fight us; "the Next.js way" can override our preferences.
- **SvelteKit** — smaller ecosystem for Tarkov-specific community code; less idiomatic Svelte in current AI training data for this domain.
- **Astro + React islands** — most of our pages are interactive (calculators), so the island model wastes its main benefit.
- **Full backend (Node/.NET/Go API + DB)** — free hosting for stateful backends is brittle (sleep timers, expiring trials, changing terms). Avoided.

## References

- [Design spec](../superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md)
- [the-hideout ecosystem](https://github.com/the-hideout)
- [tarkov-api GraphQL](https://api.tarkov.dev)
