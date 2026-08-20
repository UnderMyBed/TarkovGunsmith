# ADR-0002: Move off the tarkov.dev GraphQL API onto the JSON API

**Date:** 2026-08-18
**Status:** Accepted
**Supersedes:** Partially supersedes [ADR-0001](./0001-stack-and-hosting.md) — the data-source, edge-backend and routing/data decisions only. Everything else in ADR-0001 stands.
**Superseded by:** N/A

## Context

ADR-0001 chose the community-run `api.tarkov.dev` GraphQL API as the sole data source, with a
`data-proxy` Worker as a cache layer in front of it.

That API has returned `GraphQL server unavailable` to every query since roughly **2026-07-21**.
Upstream issue [the-hideout/tarkov-api#474](https://github.com/the-hideout/tarkov-api/issues/474)
remained open a month later, and a maintainer's answer there is unambiguous: the GraphQL API is
down, the JSON API at `json.tarkov.dev` is alive, and **tarkov.dev itself now runs on the JSON
API rather than on GraphQL**. Verified independently: the live tarkov.dev bundle references
`https://json.tarkov.dev/`.

Every route on the deployed site was without data for the duration. This was not a preference
between two working options — one of them had stopped existing.

## Decision

- **Data source:** [`json.tarkov.dev`](https://json.tarkov.dev/endpoints), game mode `regular`,
  language `en`. A resource is fetched together with its `_{lang}` sibling and merged using the
  JSONPath list upstream supplies, because text fields in the main document are translation keys
  rather than text.
- **Client-side slicing.** The browser fetches the whole items document (1.36 MB gzipped) and
  selects from it. No server-side slicing.
- **`data-proxy` is retired.** It was a cache layer for an API that no longer exists, and
  `apps/web/src/tarkov-client.ts` shows it was never actually in the production request path.
  The edge backend is now one Worker: `builds-api`.
- **`graphql-request`, `graphql` and `packages/tarkov-types` are removed.** The generated GraphQL
  types describe a schema nothing queries.
- **Domain types are the contract.** Every Zod-validated type exported by `packages/tarkov-data`
  kept its exact shape through the migration, so hooks, routes, and the existing unit and e2e
  suites acted as the regression test rather than needing rewrites.

## Consequences

**Good**

- The site has data again.
- The JSON API is a superset for this project's purposes: it exposes `ballisticCoeficient`,
  `bulletMassGrams` and `bulletDiameterMilimeters`, weapon `presets`, and slot
  `allowedCategories` — three of which were on the deferred list and are now simply available.
- `pve` and `pvp-season` game modes become possible; GraphQL never offered them.
- Caching in the client rather than the hooks means one fetch serves every query.

**Bad / accepted**

- ~1.75 MB gzipped on a cold load before any route renders. Acceptable for now; re-pointing a
  Worker at the JSON API as an edge cache is the escape hatch if it proves too heavy.
- Data that GraphQL resolved server-side must now be joined client-side: armor materials, trader
  and task ids on offers, and the weapon slot tree, which arrives as bare ids rather than nested
  objects.
- **Published numbers change.** Armor `destructibility` values moved upstream (Aramid `0.55` →
  `0.1875`), so ballistics output shifts. That is upstream tracking working as intended, not a
  regression, but it is visible to users.
- Upstream restructured the Gunsmith quest series, which required a `BuildV5` migration so
  shared builds did not silently lose their unlocks.
