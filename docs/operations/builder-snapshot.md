# Builder snapshot

The Builder reads its game data from two files generated on every build of `apps/web`, not
from `json.tarkov.dev` at runtime. The decision and its reasons are in
[ADR-0004](../adr/0004-builder-snapshot.md).

| File                          | Holds                                                                                                                                                                              | Read by                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `/data/builder-snapshot.json` | Buildable weapons, every part a weapon's slots reach, the slot graph, each weapon's presets, every offer without its price, traders, the quests that gate an offer, and `dataAsOf` | The SPA (Builder, Compare) and the OG card Functions |
| `/data/builder-prices.json`   | The prices of those offers, as of the same documents                                                                                                                               | The OG card Functions only                           |

The SPA prices offers from live data: a Web Worker fetches the raw `items` document (no
translations) and posts back only the price fields of the snapshot's ids, so the parse never
runs on the main thread. Prices load when a Builder page first needs them. They are fetched
again only once they are more than an hour old and the window regains focus or a page that
reads them mounts; nothing polls. Each load is one request: the browser's HTTP cache answers
when the last fetch from upstream was within the hour (the SPA keeps that time in
`localStorage`), and otherwise the request goes out with `no-cache`. If that request fails, a
second one asks the HTTP cache for whatever copy it holds, within 5 s; the prices then show that
copy's age. A share card is cached for 30 days, so it prices from the release-time file.

`dataAsOf` is the newest `updated` timestamp in the items document. Upstream refreshes some item
every few minutes, so in practice it is when the snapshot was taken, not when the game last
changed. The Builder's weapon panel shows it as "Data as of <date>".

## Where the data comes from

`apps/web/scripts/builder-snapshot.ts` writes both files into `apps/web/public/data/`
(gitignored), which Vite copies into `dist/`. It runs first in `pnpm --filter @tarkov/web build`
and `pnpm --filter @tarkov/web dev`. `TARKOV_SNAPSHOT_SOURCE` picks the documents; when it is
unset, each script has its own default:

| Value      | Documents                                                | Default for                 | Also used by                      |
| ---------- | -------------------------------------------------------- | --------------------------- | --------------------------------- |
| `fixtures` | The captures in `packages/tarkov-data/src/__fixtures__/` | `build` (CI, the e2e suite) | Offline local dev                 |
| `upstream` | Live `json.tarkov.dev`                                   | `dev` (`pnpm dev`)          | The release deploy (`deploy.yml`) |

Each file records its `source`. The deploy asserts `"source": "upstream"` on both files before
deploying; the post-deploy smoke job asserts the source again on the served snapshot. Against
upstream, each request times out after 60 s, and a failure to connect or a 5xx response is
retried once; a failure while reading a response body is not. Every translation document
upstream lists paths for is required, and must be a non-empty `data` object: without
`items_en`, every name would ship as its translation key.

A fixture build holds only the captured weapons: the M4A1, the PM and the golden TT-33.

```bash
pnpm dev                                                            # live data
TARKOV_SNAPSHOT_SOURCE=fixtures pnpm dev                            # offline, on the captures
pnpm --filter @tarkov/web snapshot                                  # fixtures
TARKOV_SNAPSHOT_SOURCE=upstream pnpm --filter @tarkov/web snapshot  # live
```

There is no automatic fallback: `pnpm dev` with upstream unreachable fails at the snapshot step
and says so. Use the `fixtures` override to work offline.

## When generation fails

Generation is strict for everything the snapshot holds or derives from:

- every trader and task, and their names (the snapshot keeps only the tasks that gate one of its
  offers, and fails when more quests gate offers than a profile can record, 1024);
- every buildable weapon, with its MOA, velocity, range and fire-rate fields, and its default
  ammo resolved to that cartridge's `shortName` and `initialSpeed` (a weapon whose default ammo
  is missing, or is not ammo, is drift);
- every part a weapon's slots reach, with its `updated` and `conflictingSlotIds`;
- the slots of every item a weapon reaches: `id`, `nameId` and `name` non-empty, `required` a
  boolean, and `filters.allowedItems` a list;
- every preset's `baseItem`, and the `normalizedName` of each preset of a weapon or part;
- every buildable weapon's presets: each must place into the slot graph, and a weapon with
  presets must have exactly one default;
- every offer on those: trader, quest gate, loyalty level and price fields;
- every barter rewarding one of them or a preset of one, and each of its ingredients.

Every item a weapon's slots reach must be a part, two copies of one seller's trader offer must
agree on price, and no name may still be a translation key. Records the Builder never reads
are not checked: special-slot weapons, part-typed items no weapon reaches, barters rewarding
anything else, and ingredients' own trader offers (an ingredient is valued at its flea price).

Built from upstream, the snapshot must also meet `UPSTREAM_FLOORS` in
`packages/tarkov-data/src/snapshot/limits.ts`, because a renamed type or link makes rows
vanish rather than fail to parse:

| Count                                            | Floor | Live, 2026-10-16 |
| ------------------------------------------------ | ----- | ---------------- |
| Weapons                                          | 50    | 164              |
| Parts                                            | 2000  | 2335             |
| Offers selling a weapon or part through a preset | 150   | 303              |
| Barter offers                                    | 150   | 304              |
| Weapon presets                                   | 200   | 399              |
| Weapons with presets                             | 80    | 164              |
| Quest-gated trader offers and barters            | 45    | 90               |

Any failure stops the build and lists every problem, one line each (the error message shows the
first 50):

```
upstream data no longer matches the Builder's schemas (2 problems):
  - items/<id> (ItemPropertiesBarrel): conflictingSlotIds: Invalid input: expected array, received undefined
  - items/<id>: buyFromTrader[0]: taskUnlock <id> is not in the tasks document
```

In the release deploy this fails the `pages` job's build step, before anything deploys; the
`builds-api` job waits on `pages`, so the Worker stays on the previous release too. To handle
it:

1. Run `pnpm verify:upstream` locally. It runs the same generation, floors and size budget
   against live data, and prints the same problems.
2. Decide per problem whether upstream changed shape or sent a bad record.
   - **Upstream sent a bad record** and has since corrected it: re-run the failed Deploy
     workflow run (`gh run rerun <run-id> --failed`). It builds the same release from live
     data again.
   - **Upstream changed shape:** update the schema in `packages/tarkov-data/src/queries/` (and
     recapture the fixture per the fixtures README), ship it as a PR, and merge the next
     release PR, which deploys it.

## Size budget

Every Builder visit downloads the snapshot. `SNAPSHOT_BUDGET` in
`packages/tarkov-data/src/snapshot/limits.ts` is the one copy of the budget:

| Measure                                   | Budget | Live, 2026-10-16 | Headroom | Why this number                                            |
| ----------------------------------------- | ------ | ---------------- | -------- | ---------------------------------------------------------- |
| Brotli at quality 4 (close to the edge's) | 300 KB | 255 KB           | 45 KB    | Room for upstream growth                                   |
| Raw                                       | 6 MB   | 3991 KB          | 2153 KB  | Bounds the main-thread parse (about 10 ms at today's size) |

The snapshot script fails the build when either is exceeded, so the release deploy's build step
is the hard gate. `pnpm verify:upstream` checks the same budget against live data on a schedule
as the early warning, and reports `JSON.parse` time without gating on it.

## Version

Both files carry `schema`, which `BUILDER_SNAPSHOT_SCHEMA` in
`packages/tarkov-data/src/snapshot/types.ts` must match. Bump it with any change to the file
shape. A tab opened before a deploy that changed it gets "Game data was updated. Reload the
page." rather than misreading the new file.

## Presets

The snapshot's `presets` maps each weapon id to its upstream presets, placed into the slot graph:
the default first, then the rest in upstream's order. A preset's trader offers and barters are
already among its weapon's offers, tagged with the preset; its own flea listing is carried on the
preset as the listing's player-level gate (`flea`), or `null` when upstream flags the preset
`noFlea`, and priced from the preset's id.

Choosing a weapon starts a new build from one of them:

- In theorycraft mode, the default.
- In progression mode, the default if the profile can buy it; else the cheapest preset the
  profile can buy (known price first, then short name, then id); else, when it can buy none,
  the default, which the preset picker shows locked with what it needs. A weapon chosen before
  live prices arrive is seeded again once they do, unless the build was edited in between.

A Compare side starts under its own mode: progression on the profile it carries, else
theorycraft. A weapon without presets starts empty. Loading
a saved build, a v1 link or a comparison never applies a preset, and applying a preset from the
picker leaves a loaded build's orphaned parts listed until they are dismissed.

## Saved builds

A shared build may name an id the snapshot does not hold: a part gone upstream, or a real item
no weapon slot takes (a cartridge saved into a magazine slot). On load, the Builder moves such
ids off the weapon into the build's orphaned list, where the orphaned-mods banner names them
"not a part the Builder knows". A build whose weapon is gone shows the drift banner.
