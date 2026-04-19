# `@tarkov/data`

Typed, Zod-validated data layer for the [api.tarkov.dev](https://api.tarkov.dev) GraphQL API. Wraps `graphql-request` with TanStack Query hooks for React consumers.

## What's in this package

- `client.ts` — `createTarkovClient(endpoint, fetch?)` returns a GraphQLClient.
- `provider.tsx` — `<TarkovDataProvider client={...}>` Context + `useTarkovClient()` hook for `apps/web` to plumb the client.
- `queries/<name>.ts` — one file per query: a query string, a Zod response schema, a recorded JSON fixture (`__fixtures__/<name>.json`), and a `fetch<Name>(client, args?)` function that calls the client and Zod-parses the response.
- `hooks/use<Name>.ts` — thin TanStack Query wrappers around the `fetch<Name>` functions. 3 lines each; consumers exercise them in `apps/web` integration tests.

## Conventions

- **One query per file.** Co-locate query string + Zod schema + fetcher.
- **Fetchers are tested; hooks are not (in this package).** Hook logic is too thin to unit-test usefully here. They're typed and lint-checked; behavioral tests live in `apps/web`.
- **Fixtures are recorded from the live API**, then committed. Re-record with `pnpm --filter @tarkov/data fixture:refresh <name>` (script TBD; until then, refresh manually with curl + jq).
- **Zod schemas mirror the GraphQL response shape.** Use them as the source of truth for runtime validation; they're cheaper to evolve than regenerating types.
- **Default endpoint:** `https://api.tarkov.dev/graphql`. Override via `<TarkovDataProvider client={...}>`.
- **No React in tests.** The vitest env is `node`. Tests stub `fetch` directly.

## How to add a new query

Use the `add-data-query` project skill (in `.claude/skills/`). It scaffolds the four file types (query, schema, fixture, test) and the hook.

## Out of scope

- The `data-proxy` Worker (caching layer between the SPA and `api.tarkov.dev`) — that's `apps/data-proxy`, plan 0b.
- React component tests — those live in `apps/web`.
- Mod compatibility / weapon-build queries — deferred to a follow-up plan once the MVP queries prove the pattern.
