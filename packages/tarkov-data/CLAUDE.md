# `@tarkov/data`

Typed, Zod-validated data layer for [`json.tarkov.dev`](https://json.tarkov.dev/endpoints), the community JSON API. Plus the build/pair schemas, migrations, progression gating, and the TarkovTracker integration.

> **Rewritten 2026-08-18.** This file previously described the `api.tarkov.dev` GraphQL API, `graphql-request`, per-query JSON fixtures, and an `apps/data-proxy` worker. All four are gone — GraphQL went down in July 2026 ([the-hideout/tarkov-api#474](https://github.com/the-hideout/tarkov-api/issues/474)) and the package moved to the JSON API in #113. See [ADR-0002](../../docs/adr/0002-json-api-migration.md).

## The shape that matters most

**Everything comes from a handful of big documents, not per-entity endpoints.** `items` is one map of all ~5,300 items keyed by id, 16.7 MB raw. `tasks` and `traders` likewise. There is no "fetch one weapon" call.

That drives every convention below:

- `client.ts` — `createTarkovClient(baseUrl, fetchImpl?, ttlMs?)` returns a `TarkovJsonClient` with a single method, `fetchResource<T>(resource)`. It **caches per resource** (default 1h) because six query modules read the same items document, and it **never caches a rejection** — an upstream blip would otherwise poison the client for a full TTL.
- `translations.ts` — upstream returns `{ data, translations }` where `translations` is a list of JSONPaths whose values are translation keys. `mergeTranslations` resolves them against the `<resource>_en` document. The path list comes from upstream deliberately; hard-coding it would silently stop translating new fields instead of failing visibly.
- `queries/<name>.ts` — a Zod schema plus `fetch<Name>(client)`. Fetchers **select from the items document by `properties.propertiesType`** and `safeParse` each candidate, dropping non-matches. One unrelated item shape must never fail the whole call.
- `queries/documents.ts` — the upstream document shapes after the translation merge.
- `hooks/use<Name>.ts` — thin TanStack Query wrappers. Behavioural tests live in `apps/web`.

## Conventions

- **Fixtures are trimmed samples of the real document** (`__fixtures__/items-sample.json`, `tasks-sample.json`, `traders-sample.json`), driven through `__fixtures__/client.ts`'s `fixtureClient()` so tests exercise the real translation merge. `structuredClone` per call, because `mergeTranslations` rewrites in place.
- **Fixture values must be able to occur upstream.** See the warning below — this is not a style preference.
- **Zod schemas are the runtime contract.** Cheaper to evolve than generated types.
- **Joins happen here, not upstream.** The JSON API returns bare ids where GraphQL embedded objects: armor `material` joins to `armorMaterials`, task/offer `trader` joins to the traders document, and `buyFor` is reconstructed from `buyFromTrader` + `minLevelForFlea` in `queries/shared/buy-for.ts`.
- **No React in tests.** The vitest env is `node`; tests stub the client, not `fetch`.

## ⚠️ Units: upstream sends fractions, and it has cost us before

`recoilModifier` and `accuracyModifier` are **fractions** — `-0.21` means −21%. `armorDamage` is a **percent** — `52` means 52%.

A 2026-08 audit found the recoil fraction being consumed as a percent, making every recoil calculation 100× too weak for the entire life of the project. It survived because the test fixtures used invented percent-scale values up to 43× larger than anything upstream returns, so no assertion could catch it.

**A fixture with an impossible magnitude is worse than no fixture.** Before inventing a number, check the real range in `docs/operations/data-api-audit.md`, which records the measured live distribution for every field this package consumes, and a procedure for re-measuring it.

## What else lives here

- `build-schema.ts` / `build-migrations.ts` — versioned build schema and the vN→vN+1 chain. `PlayerProfile` is embedded in saved builds as `profileSnapshot`, so **changing it is a persisted schema change** requiring a new version and migration. Builds in the wild must keep loading.
- `pair-schema.ts` — build-comparison pairs.
- `item-availability.ts` — trader-LL / quest / flea gating from a `PlayerProfile`.
- `slot-diff.ts`, `stat-delta.ts` — build comparison.
- `buildsApi.ts` / `pairsApi.ts` — clients for the `builds-api` Worker.
- `tarkovtracker/` — external progression import.

## How to add a new query

Use the `add-data-query` project skill in `.claude/skills/`. Verify a suspected shape change with `verify-data-shape`.

## Out of scope

- React component tests — `apps/web`.
- KV storage and share URLs — `apps/builds-api`.
- Ballistics math — `packages/ballistics`.
