# `@tarkov/types`

Generated TypeScript types for the [api.tarkov.dev](https://api.tarkov.dev) GraphQL schema. Type-only — no runtime code.

## What's in this package

- `src/generated/schema.graphql` — the cached upstream schema (source of truth for codegen)
- `src/generated/types.ts` — generated TS types from the cached schema
- `src/index.ts` — public barrel that re-exports the generated types

## How codegen works

- **Default:** `pnpm --filter @tarkov/types codegen` reads the local cached schema and regenerates types. Builds never depend on the upstream being reachable.
- **Refresh:** `pnpm --filter @tarkov/types codegen:refresh` fetches the latest schema from the live API, writes it to `src/generated/schema.graphql`, then regenerates types.

Both modes auto-format the output with Prettier.

## Conventions

- **Never edit `src/generated/` by hand.** Anything you touch will be lost on the next codegen.
- **Always commit generated files.** Builds use them as-is.
- **Refresh on demand.** Schema drift is detected by re-running `codegen:refresh` and inspecting the diff. The Tier C cron will automate this later.
- **Zod runtime schemas live elsewhere** — in `packages/tarkov-data`, next to each query. This package is type-only.

## How to add a new field

You don't. Upstream owns the schema. To pick up a new field:

1. `pnpm --filter @tarkov/types codegen:refresh`
2. Inspect the diff in `src/generated/`
3. Commit it
4. Update consumers in `packages/tarkov-data` to query the new field

## Out of scope

- Runtime data fetching (that's `@tarkov/data`)
- Zod schemas (also `@tarkov/data`, per query)
- The data layer's TanStack Query hooks
