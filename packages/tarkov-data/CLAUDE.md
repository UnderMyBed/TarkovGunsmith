# `@tarkov/data`

Typed, Zod-validated data layer for [`json.tarkov.dev`](https://json.tarkov.dev/endpoints), the community JSON API. Plus the build/pair schemas, migrations, progression gating, and the TarkovTracker integration.

> **Rewritten 2026-08-18.** This file previously described the `api.tarkov.dev` GraphQL API, `graphql-request`, per-query JSON fixtures, and an `apps/data-proxy` worker. All four are gone — GraphQL went down in July 2026 ([the-hideout/tarkov-api#474](https://github.com/the-hideout/tarkov-api/issues/474)) and the package moved to the JSON API in #113. See [ADR-0002](../../docs/adr/0002-json-api-migration.md).

## The shape that matters most

**Everything comes from a handful of big documents, not per-entity endpoints.** `items` is one map of all ~5,300 items keyed by id, 16.7 MB raw. `tasks` and `traders` likewise. There is no "fetch one weapon" call.

That drives every convention below:

- `client.ts` — `createTarkovClient(baseUrl, fetchImpl?, ttlMs?)` returns a `TarkovJsonClient` with a single method, `fetchResource<T>(resource)`. It **caches per resource** (default 1h) because six query modules read the same items document, and it **never caches a rejection** — an upstream blip would otherwise poison the client for a full TTL.
- `translations.ts` — upstream returns `{ data, translations }` where `translations` is a list of JSONPaths whose values are translation keys. `mergeTranslations` resolves them against the `<resource>_en` document. The path list comes from upstream deliberately; hard-coding it would silently stop translating new fields instead of failing visibly.
- `queries/<name>.ts` — a Zod schema, and for the ammo, armor and single-weapon reads a `fetch<Name>(client)`. Those fetchers **select from the items document by `properties.propertiesType`** and `safeParse` each candidate, dropping non-matches. One unrelated item shape must never fail the whole call.
- `queries/documents.ts` — the upstream document shapes after the translation merge.
- `snapshot/` — the Builder's build-time game data ([ADR-0004](../../docs/adr/0004-builder-snapshot.md), runbook `docs/operations/builder-snapshot.md`). `generate.ts` turns the four documents into a `BuilderSnapshot` plus `BuilderPrices`, **strictly**: every problem is collected into one `SnapshotDriftError` rather than a record being dropped. `load.ts` parses the served files and refuses another `schema` with `SnapshotVersionError`. `views.ts` derives the catalog, weapon list, slot graph and weapon tree from a snapshot. `source.ts` is the SPA's `BuilderDataSource`: the snapshot fetched once, prices from the raw `items` document refreshed hourly.
- `hooks/use<Name>.ts` — thin TanStack Query wrappers, covered here (see below). The Builder hooks (`useWeaponList`, `usePartCatalog`, `useWeaponTree`, `useTraders`, `useTasks`, `useBuilderSnapshot`) read the `BuilderDataSource` given to `<TarkovDataProvider builderData={…}>`; the rest read the client. Route-level integration (a hook wired into an actual page) is still `apps/web`'s job.

## Conventions

- **Fixtures are trimmed samples of the real document** (`__fixtures__/items-sample.json`, `tasks-sample.json`, `traders-sample.json`), driven through `__fixtures__/client.ts`'s `fixtureClient()` so tests exercise the real translation merge. `structuredClone` per call, because `mergeTranslations` rewrites in place.
- **Fixture values must be able to occur upstream.** See the warning below — this is not a style preference.
- **Zod schemas are the runtime contract.** Cheaper to evolve than generated types.
- **Joins happen here, not upstream.** The JSON API returns bare ids where GraphQL embedded objects: armor `material` joins to `armorMaterials`, task/offer `trader` joins to the traders document, and `buyFor` is reconstructed in `queries/shared/buy-for.ts`. `createOfferCollector` (pure, over the translated documents) builds an item's offers without prices from its own `buyFromTrader`, its `/barters` entries, the cash offers and barters of every preset whose `properties.baseItem` is the item (tagged `preset`), and its flea entry (`minLevelForFlea`). `extractPrices` reads a `PriceTable` from any items lookup — the merged document or the raw one — and `priceOffers` joins the two into `buyFor`. `createOfferResolver` composes all three over one set of documents.
- **Barters are an array, with fractional counts.** `/barters` is `data: [...]`, not an id-keyed map, and Ref's GP-coin `count` arrives as e.g. `155.1`. A barter's `priceRUB` comes from `barterCostRUB`, a placeholder over the flea read that the single price model (#218) replaces; it is `null` with a reason when a required item has no flea price.
- **Offers from traders the profile doesn't track stay visible.** Offer collection joins against every trader in the traders document, and `itemAvailability` reports a Ref- or Fence-only item as `untracked-trader` instead of dropping the offer.
- **Non-hook tests stay React-free.** The vitest env defaults to `node`; tests stub the
  client, not `fetch`.
- **Hook tests opt into jsdom per-file.** `hooks/use*.test.ts` files carry a
  `// @vitest-environment jsdom` pragma (the package default stays `node`) and render through
  `@testing-library/react`'s `renderHook`, using the shared wrappers in
  `__test-utils__/query-wrapper.ts` (`withTarkovProvider(client)` for the `useTarkovClient()`
  hooks, `withQueryClient()` for the `buildsApi`/`pairsApi`-backed ones). That wrapper file
  builds its provider tree with `createElement` instead of JSX so it — and every hook test
  that imports it — can stay a plain `.ts` file; see its own comment for why. The `apps/web`
  pattern this otherwise mirrors (e.g. `features/builder/build-header.test.tsx`) uses real JSX
  because that package's root ESLint config already has a `.test.tsx`-aware project entry —
  this package's didn't, and adding one is `eslint.config.js`, out of scope here.

## ⚠️ Units: upstream sends fractions, and it has cost us before

`recoilModifier` and `accuracyModifier` are **fractions** — `-0.21` means −21%. `armorDamage` is a **percent** — `52` means 52%.

A 2026-08 audit found the recoil fraction being consumed as a percent, making every recoil calculation 100× too weak for the entire life of the project. It survived because the test fixtures used invented percent-scale values up to 43× larger than anything upstream returns, so no assertion could catch it.

**A fixture with an impossible magnitude is worse than no fixture.** Before inventing a number, check the real range in `docs/operations/data-api-audit.md`, which records the measured live distribution for every field this package consumes, and a procedure for re-measuring it.

## What else lives here

- `build-schema.ts` / `build-migrations.ts` — versioned build schema and the vN→vN+1 chain. `PlayerProfile` is embedded in saved builds as `profileSnapshot`, so **changing it is a persisted schema change** requiring a new version and migration. Builds in the wild must keep loading.
- `pair-schema.ts` — build-comparison pairs.
- `item-availability.ts` — trader-LL / quest / flea gating from a `PlayerProfile`, over cash offers, barters and preset offers alike.
- `slot-diff.ts`, `stat-delta.ts` — build comparison.
- `buildsApi.ts` / `pairsApi.ts` — clients for the `builds-api` Worker.
- `tarkovtracker/` — external progression import.

## How to add a new query

Use the `add-data-query` project skill in `.claude/skills/`. Verify a suspected shape change with `verify-data-shape`.

## Out of scope

- React _component_ tests (JSX pages/panels) — `apps/web`. This package's own hooks tests
  are in scope here (see Conventions above); it's route-level UI that isn't.
- KV storage and share URLs — `apps/builds-api`.
- Ballistics math — `packages/ballistics`.
