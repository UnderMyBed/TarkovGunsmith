---
name: add-feature-route
description: Use when adding a new top-level route to apps/web (e.g. /calc, /matrix, /builder). Scaffolds the route file using TanStack Router file-based conventions, the page component, a loading/error boundary, a Vitest component test, and a Playwright e2e smoke test.
---

# add-feature-route

## When to use

Adding any new URL-addressable page to `apps/web`.

## What it does

1. Asks: "What is the route path, page name, and one-line description?"
2. Creates the route file: `apps/web/src/routes/<path>.tsx` (TanStack Router file-based — nested paths use directories).
3. Creates the page component: `apps/web/src/features/<name>/<Name>Page.tsx`.
4. Adds a loading state and an error boundary inside the route file.
5. Creates the Vitest component test: `apps/web/src/features/<name>/<Name>Page.test.tsx` — renders the page with mocked TanStack Query data, asserts the title and at least one interactive element.
6. Adds the route to the `ROUTES` array in `apps/web/e2e/smoke.spec.ts` if it goes in the `__root.tsx` nav; a route with an interaction flow worth protecting also gets its own `apps/web/e2e/<name>.spec.ts`, importing `test`/`expect` from `./upstream.js` rather than `@playwright/test`.

## Conventions

- One feature folder per route under `apps/web/src/features/<name>/`.
- Route files are thin: data loading + error/loading + render the feature component.
- Feature components contain the actual UI logic. shadcn primitives from `@tarkov/ui`.
- Data: TanStack Query hooks from `@tarkov/data`. Never call `fetch` or the JSON API directly from a route file.
- Colour and radius come from the `@theme` tokens in `packages/ui/src/styles/index.css`, as `bg-[var(--color-…)]`. Raw Tailwind palette classes do not belong in app code.

## Out of scope

- New data queries. Use `add-data-query` first if needed.
- Shared UI primitives. Those go in `packages/ui`, and `apps/web/src/styles.test.ts` must be extended to guard any visually load-bearing class only that primitive uses.
