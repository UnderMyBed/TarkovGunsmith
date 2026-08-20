---
name: add-data-query
description: Use when the SPA needs data from json.tarkov.dev that no existing hook exposes. Adds the Zod-validated selector to packages/tarkov-data/src/queries, the TanStack Query hook beside it, and a Vitest test that runs against the committed fixture captures.
---

# add-data-query

## When to use

Any time the SPA needs data from `json.tarkov.dev` that isn't already exposed by an existing hook in `packages/tarkov-data/src/hooks/`.

## What it does

1. Asks: "What's the selector name (camelCase), and which upstream document holds the records — `items`, `tasks` or `traders`?"
2. Writes `packages/tarkov-data/src/queries/<name>.ts`: a Zod schema for the records you want, plus `fetch<Name>(client)` calling `client.fetchResource<Document>("<doc>")` and `safeParse`-ing each candidate out of the id-keyed map.
3. Writes the hook to `packages/tarkov-data/src/hooks/use<Name>.ts` — `useQuery` with `queryKey: ["<name>"]` over `useTarkovClient()`.
4. Exports the schema, the fetcher, the inferred type and the hook from `packages/tarkov-data/src/index.ts`.
5. Writes `packages/tarkov-data/src/queries/<name>.test.ts` against the committed captures in `packages/tarkov-data/src/__fixtures__/`, through that directory's `client.ts`.

## What it requires

- The selector name (e.g. `ammoList`).
- Which upstream document holds the records, and what one record looks like. Ask `tarkov-api-explorer` if you don't know.

## Conventions

- The upstream documents are **id-keyed maps, not arrays**, and one document carries every item type. A selector filters by shape (`properties.propertiesType`); it is never handed a pre-filtered list.
- **Reject, don't throw.** `safeParse` each candidate and skip the failures, so a single unrelated item shape can't fail the whole call. Log the dropped count at `console.debug` — that's how a new upstream variant becomes discoverable.
- Hook names: `useAmmoList`, `useArmorList`, `useWeapon` — camelCase, prefixed `use`.
- Every selector MUST be tested against a fixture, never the live API. If `items-sample.json` lacks a record the selector should accept — or one it should reject — add it, keeping that accept/reject mix intact.

## Out of scope

- UI that consumes the hook. That's `add-feature-route`.
- Checking a fixture against live upstream. That's `pnpm verify:upstream`, on a schedule, off CI.
