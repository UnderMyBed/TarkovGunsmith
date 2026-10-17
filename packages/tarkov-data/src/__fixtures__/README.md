# Upstream fixtures

Trimmed captures of `json.tarkov.dev/regular/{items,tasks,traders,barters}` and their `_en`
siblings, taken 2026-08-18. `barters-sample.json`, and the presets, signal items and barter
ingredients added to `items-sample.json` alongside it, were captured 2026-10-16. Each `*-sample.json` is `{ document, lang }` — `document` is the raw upstream
envelope (`{ data, translations }`), `lang` is the subset of the `_en` map those records need.

They exist so the suite does not depend on upstream being reachable. The GraphQL API this project
used to call went down for over a month; tests that need a live API stop being tests the moment
that happens.

Three consumers read them: this package's unit tests via `client.ts`; every `apps/web` build
other than the release deploy, which generates the Builder snapshot from them
(`apps/web/scripts/builder-snapshot.ts`); and the Playwright suite via
`apps/web/e2e/upstream-fixtures.ts`, which serves the raw envelopes to the browser. Trimming an
item out of `items-sample.json` can therefore empty a picker in an e2e spec —
`apps/web/e2e/upstream.ts` documents which content the specs depend on. Snapshot generation is
strict, so an item the captures add must match its schema in full or every build fails.

`items-sample.json` deliberately includes item types the selectors must _reject_ as well as ones
they must accept — a grenade, a helmet and an armor attachment alongside ammo, armor, weapons and
every slot-attachable part type (weapon mods, barrels, scopes, magazines) — so a selector that is
too permissive fails rather than passing quietly. The SP-81 signal pistol and an RSP-30 cartridge
are `ItemPropertiesWeapon` items the weapon list must reject.

The M4A1's parts are chosen to exercise the slot graph and its conflicts with real data: a barrel's
required gas block (the DD MK12 low-profile gas block) sits four levels deep, the Aeroknox AX-15
10.5" handguard and the 10.3" barrel are a one-directional `conflictingItems` pair, and the
Aeroknox AX-15 4" handguard blocks the A2 20" barrel's muzzle, gas-block and launcher slots through
`conflictingSlotIds` — which the M4A1 front sight gas block, fitting both the 10.3" and the A2
barrel, makes reachable by swapping barrels.

`barters-sample.json` carries the barters behind the offer-resolution tests: the PM default
preset (Prapor LL1), two M4A1 preset barters (Peacekeeper and Mechanic LL2), a mod barter that
undercuts its cash gate (Badger latch, Mechanic LL1), a barter-only scope (ELCAN FDE) and a Ref
GP-coin barter. Every item those barters require is in `items-sample.json` with its flea price,
except GP coin, which has none upstream.

Added 2026-10-16 with the Builder snapshot's strict generation: the task "I Need More Power"
(`5a03296886f774569778596a`), which a captured offer is quest-locked behind and which strict
generation requires to resolve; and the PVS-7 Wilcox adapter (`5c11046cd174af02a012e42b`), a
helmet mount — part-typed, flea-priced, and reached by no weapon slot — for the barter-ingredient
tests.

`legacy-buy-for.json` pins what the offer resolver returned for every fixture weapon and part
before offers were split from prices (main at `2b8c53b`, over these same captures).
`generate.test.ts` checks the snapshot against it. Regenerate it only when a capture changes
those items' offers, and from the pre-split resolver, never from the code under test.

`preset-oracle-sample.json` holds six upstream weapon presets with their base weapons and every
part they list, captured 2026-10-16, for `preset-oracle.test.ts`: the presets' own ergonomics and
recoil are the oracle the Builder's stat path must reproduce.

**Refresh** by re-capturing from `json.tarkov.dev` when upstream shapes change, keeping the
accept/reject mix above intact. `scripts/verify-upstream-contract.ts` checks these fixtures
against live upstream and is the fastest way to find out that a shape has moved.
