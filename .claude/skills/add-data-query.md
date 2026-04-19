---
name: add-data-query
description: Use when adding a new GraphQL query against tarkov-api. Scaffolds the query file in packages/tarkov-data, generates types via packages/tarkov-types codegen, creates a typed TanStack Query hook, and stubs an MSW mock + a Vitest test using a recorded fixture.
---

# add-data-query

## When to use

Any time the SPA needs data from `api.tarkov.dev` that isn't already exposed by an existing hook in `packages/tarkov-data/src/hooks/`.

## What it does

1. Asks: "What's the query name (camelCase) and the GraphQL operation?"
2. Writes the `.graphql` file to `packages/tarkov-data/src/queries/<name>.graphql`.
3. Runs `pnpm --filter @tarkov/types codegen` to regenerate types.
4. Writes the hook to `packages/tarkov-data/src/hooks/use<Name>.ts` using TanStack Query + the generated types.
5. Records a fixture by calling tarkov-api once via the dev proxy and saves it to `packages/tarkov-data/src/__fixtures__/<name>.json`.
6. Writes an MSW handler in `packages/tarkov-data/src/__mocks__/handlers.ts`.
7. Writes a Vitest test that asserts the hook returns the fixture-shaped data.

## What it requires

- The query name (e.g. `ammoList`).
- The GraphQL operation body.
- Confirmation that the operation parses against the current tarkov-api schema (the codegen step will fail loudly otherwise).

## Conventions

- Hook names: `useAmmoList`, `useArmorList`, `useWeapon` — camelCase, prefixed `use`.
- Fixture file names match the query name.
- Every query MUST have a recorded fixture — never test against the live API in CI.

## Out of scope

- Modifying `data-proxy` cache rules. Use `add-cache-rule` (future) for that.
- UI components that consume the hook. Those are scaffolded by `add-feature-route`.
