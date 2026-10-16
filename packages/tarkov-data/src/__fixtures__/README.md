# Upstream fixtures

Trimmed captures of `json.tarkov.dev/regular/{items,tasks,traders}` and their `_en` siblings,
taken 2026-08-18. Each `*-sample.json` is `{ document, lang }` — `document` is the raw upstream
envelope (`{ data, translations }`), `lang` is the subset of the `_en` map those records need.

They exist so the suite does not depend on upstream being reachable. The GraphQL API this project
used to call went down for over a month; tests that need a live API stop being tests the moment
that happens.

Two consumers read them: this package's unit tests via `client.ts`, and the Playwright suite via
`apps/web/e2e/upstream-fixtures.ts`, which serves the raw envelopes back to the browser and to the
OG Pages Functions. Trimming an item out of `items-sample.json` can therefore empty a picker in an
e2e spec — `apps/web/e2e/upstream.ts` documents which content the specs depend on.

`items-sample.json` deliberately includes item types the selectors must _reject_ as well as ones
they must accept — a grenade, a helmet and an armor attachment alongside ammo, armor, weapons and
every slot-attachable part type (weapon mods, barrels, scopes, magazines) — so a selector that is
too permissive fails rather than passing quietly.

The M4A1's parts are chosen to exercise the slot graph and its conflicts with real data: a barrel's
required gas block (the DD MK12 low-profile gas block) sits four levels deep, the Aeroknox AX-15
10.5" handguard and the 10.3" barrel are a one-directional `conflictingItems` pair, and the
Aeroknox AX-15 4" handguard blocks the A2 20" barrel's muzzle, gas-block and launcher slots through
`conflictingSlotIds`.

**Refresh** by re-capturing from `json.tarkov.dev` when upstream shapes change, keeping the
accept/reject mix above intact. `scripts/verify-upstream-contract.ts` checks these fixtures
against live upstream and is the fastest way to find out that a shape has moved.
