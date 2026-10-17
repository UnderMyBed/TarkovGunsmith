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
  `dataAsOf` (the newest `updated` timestamp upstream). The Builder, Compare, and the OG cards
  read it instead of the upstream documents.
- **Generated, not committed.** The release deploy generates it from live `json.tarkov.dev`;
  every other build, including CI and the e2e suite, generates it from the committed captures.
  Each file records which (`source`), and the deploy refuses to ship a fixture snapshot.
- **Strict generation.** Every record must match its schema, every weapon-reachable slot item
  must be a part, and duplicate trader offers must agree on price. Any failure fails the build
  with every problem listed, so drift stops a release instead of reaching users. The lenient
  per-record parse paths are removed.
- **Prices stay live in the SPA.** Offers are stored without prices. The SPA prices them from
  the raw `items` document — no translation sibling, price fields only — refreshed hourly.
- **OG cards price from the release.** A separate `/data/builder-prices.json`, generated with
  the snapshot, prices the share cards. Only the OG Functions read it; the SPA never downloads
  it. A card is cached for 30 days, so its price is a point-in-time figure regardless.
- **Versioned.** Both files carry `schema`. A tab holding code from an earlier deploy refuses a
  file of another version with "Game data was updated. Reload the page."
- **Budget.** The snapshot must stay within 250 KB brotli and 4.5 MB raw, checked against live
  data by `pnpm verify:upstream`.

## Consequences

**Good**

- The Builder's upstream request on a visit is the raw `items` document for prices; traders,
  tasks, barters and every translation document are gone from its critical path.
- On the 2026-10-16 live data the snapshot is 3.7 MB raw and 181 KB brotli, and parses in under
  10 ms; parsing the raw items document took 36 ms.
- Upstream drift fails a release build, listing every problem, rather than silently emptying a
  picker in production.
- The OG cards read the deploy's own static assets and make no upstream request.
- Local dev, CI and the e2e suite never depend on upstream being reachable to build.

**Bad / accepted**

- Structural data is as old as the last release. A game patch reaches the Builder only when a
  release is cut; `dataAsOf` is shown in the weapon panel so the age is visible.
- A release cannot ship while upstream is drifted, even if the change being released is
  unrelated. That is deliberate: the alternative ships a Builder with records missing.
- A shared build may name a part a later snapshot no longer holds. Those ids move to the build's
  orphaned list on load rather than staying on the weapon.
- The fixture snapshot holds only the captured weapons, so local dev shows two of them.
