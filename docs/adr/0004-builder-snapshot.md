# ADR-0004: Generate the Builder's game data at build time

**Date:** 2026-10-16
**Status:** Accepted
**Supersedes:** Refines [ADR-0002](./0002-json-api-migration.md) — client-side slicing, for the Builder only. Every other route still fetches and slices the JSON API in the browser.
**Superseded by:** N/A

## Context

Under ADR-0002 the Builder fetched four `json.tarkov.dev` documents (items, traders, tasks,
barters, each with its translation sibling) on every visit and joined them in the browser: the
items document alone is about 1.36 MB gzipped. The structural part of that work — which weapons
are buildable, which parts each slot reaches, which trader sells what at which loyalty level —
only changes when the game is patched, yet every visitor paid for it.

The selectors also parsed leniently: a record that failed its schema was dropped and the rest
kept, so upstream drift reached users as a weapon or part silently missing from a picker. And
the OG card Functions repeated the whole fetch and join server-side, per isolate.

## Decision

- **A build-time snapshot.** `apps/web/scripts/builder-snapshot.ts` generates
  `/data/builder-snapshot.json` on every build: buildable weapons, every part reachable through
  their slots, the slot graph, every offer with its price left out, traders, tasks, and
  `dataAsOf` (the newest `updated` timestamp upstream — in effect the time the snapshot was
  taken, since upstream refreshes some item every few minutes). The Builder, Compare, and the OG cards
  read it instead of the upstream documents.
- **Generated, not committed.** The release deploy and local dev generate it from live
  `json.tarkov.dev`; CI and the e2e suite generate it from the committed captures.
  Each file records which (`source`), and the deploy refuses to ship a fixture snapshot.
- **Strict generation, scoped to what the snapshot holds.** Everything the snapshot contains or
  derives from must parse: every trader and task, every buildable weapon, every part a weapon's
  slots reach (with its `updated` and `conflictingSlotIds`), the slots of every reached item,
  every preset's link to its base item, every offer on those (trader, quest gate, loyalty
  level, price fields), every barter rewarding one of them or a preset of one, and each barter
  ingredient. Weapon-reachable slot items must be parts, duplicate trader offers must agree on
  price, and names must not still be translation keys; the generator also requires every
  translation document upstream lists paths for. Any failure fails the build with every
  problem listed, so drift stops a release instead of reaching users. Records the Builder never
  reads — special-slot weapons, part-typed items no weapon reaches, barters rewarding anything
  else, ingredients' own trader offers — are not checked, so unrelated upstream records cannot
  block a release. The lenient per-record parse paths are removed.
- **Floors on an upstream build.** Strict parsing cannot see rows that stop being recognised: a
  renamed `propertiesType` or `baseItem` yields a valid but gutted snapshot. A snapshot built
  from upstream must hold at least 50 weapons, 2000 parts, 150 offers selling through a preset
  and 150 barter offers, about half of live (164, 2335, 303 and 304 on 2026-10-17).
- **Prices stay live in the SPA.** Offers are stored without prices. The SPA prices them from
  the raw `items` document — no translation sibling, price fields only — parsed in a Web
  Worker and refetched past the HTTP cache once the cached copy is more than an hour old.
- **OG cards price from the release.** A separate `/data/builder-prices.json`, generated with
  the snapshot, prices the share cards. Only the OG Functions read it; the SPA never downloads
  it. A card is cached for 30 days, so its price is a point-in-time figure regardless.
- **Versioned.** Both files carry `schema`. A tab holding code from an earlier deploy refuses a
  file of another version with "Game data was updated. Reload the page."
- **Budget.** The snapshot must stay within 300 KB brotli (measured at quality 4, near what the
  edge serves) and 6 MB raw. The brotli figure leaves room for the weapon presets #216 adds
  (about 27 KB) and for upstream growth; the raw figure bounds the main-thread parse. The
  release build fails over either, and `pnpm verify:upstream` checks the same constant on a
  schedule.

## Consequences

**Good**

- The Builder's upstream request on a visit is the raw `items` document for prices; traders,
  tasks, barters and every translation document are gone from its critical path.
- On the 2026-10-16 live data the snapshot is 3.7 MB raw and 236 KB brotli at quality 4, and
  parses in under 10 ms; parsing the raw items document took 36 ms.
- Upstream drift fails a release build, listing every problem, rather than silently emptying a
  picker in production.
- The OG cards read the deploy's own static assets and make no upstream request.
- CI and the e2e suite never depend on upstream being reachable to build. Local dev reads live
  data by default and can run offline on the captures.

**Bad / accepted**

- Structural data is as old as the last release. A game patch reaches the Builder only when a
  release is cut; the weapon panel shows "Data as of <date>" so the snapshot's age is visible.
- A release cannot ship while upstream is drifted, even if the change being released is
  unrelated. That is deliberate: the alternative ships a Builder with records missing.
- A shared build may name a part a later snapshot no longer holds. Those ids move to the build's
  orphaned list on load rather than staying on the weapon.
- The brotli headroom is 64 KB on the 2026-10-17 data, about 37 KB once #216's presets land.
  Sustained growth in parts or offers upstream will reach it and need a deliberate decision.
- A release build depends on `json.tarkov.dev` answering. Each request times out and is retried
  once; a longer outage fails the build, and production keeps the previous release.
