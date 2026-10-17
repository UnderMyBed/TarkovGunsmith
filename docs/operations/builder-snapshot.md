# Builder snapshot

The Builder reads its game data from two files generated on every build of `apps/web`, not
from `json.tarkov.dev` at runtime. The decision and its reasons are in
[ADR-0004](../adr/0004-builder-snapshot.md).

| File                          | Holds                                                                                                                               | Read by                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `/data/builder-snapshot.json` | Buildable weapons, every part a weapon's slots reach, the slot graph, every offer without its price, traders, tasks, and `dataAsOf` | The SPA (Builder, Compare) and the OG card Functions |
| `/data/builder-prices.json`   | The prices of those offers, as of the same documents                                                                                | The OG card Functions only                           |

The SPA prices offers from live data: it fetches the raw `items` document (no translations) and
reads only its price fields, refreshed hourly. A share card is cached for 30 days, so it prices
from the release-time file.

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

Each file records its `source`. The deploy asserts `"source": "upstream"` on both files, and the
snapshot's raw size, before deploying; the post-deploy smoke job asserts the source again on the
served snapshot. Against upstream, each request times out after 60 s and is retried once on a
5xx or network failure, and every translation document upstream lists paths for is required:
without `items_en`, every name would ship as its translation key.

A fixture build holds only the captured weapons (the M4A1 and the PM).

```bash
pnpm dev                                                            # live data
TARKOV_SNAPSHOT_SOURCE=fixtures pnpm dev                            # offline, on the captures
pnpm --filter @tarkov/web snapshot                                  # fixtures
TARKOV_SNAPSHOT_SOURCE=upstream pnpm --filter @tarkov/web snapshot  # live
```

There is no automatic fallback: `pnpm dev` with upstream unreachable fails at the snapshot step
and says so. Use the `fixtures` override to work offline.

## When generation fails

Generation is strict for everything the snapshot holds or derives from: every trader and task;
every buildable weapon; every part a weapon's slots reach, with its `updated` and
`conflictingSlotIds`; every offer on those — trader, quest gate, loyalty level and price fields;
every barter rewarding one of them or a preset of one, and each of its ingredients. Every item
a weapon's slots reach must be a part, two copies of one trader offer must agree on price, and
no name may still be a translation key. Records the Builder never reads — special-slot weapons,
part-typed items no weapon reaches, barters rewarding anything else — are not checked. Any
failure stops the build and lists every problem, one line each:

```
upstream data no longer matches the Builder's schemas (2 problems):
  - items/<id> (ItemPropertiesBarrel): conflictingSlotIds: Invalid input: expected array, received undefined
  - items/<id>: buyFromTrader[0]: taskUnlock <id> is not in the tasks document
```

In the release deploy this fails the `pages` job's build step, before anything deploys; the
`builds-api` job waits on `pages`, so the Worker stays on the previous release too. To handle
it:

1. Run `pnpm verify:upstream` locally. It runs the same generation against live data, plus the
   size budget below, and prints the same problems.
2. Decide per problem whether upstream changed shape (update the schema in
   `packages/tarkov-data/src/queries/`, and recapture the fixture per the fixtures README) or
   sent a bad record (wait for upstream to correct it).
3. Ship the fix as a PR, then merge the release PR again.

## Size budget

Every Builder visit downloads the snapshot. `pnpm verify:upstream` fails when it exceeds
**250 KB brotli** (measured at quality 4, close to what the edge serves) or **4.5 MB raw**, and
reports its `JSON.parse` time without gating on it. The deploy also fails a snapshot over
4.5 MB raw. On the 2026-10-16 data it is 3685 KB raw and 236 KB brotli: 14 KB of brotli
headroom.

## Version

Both files carry `schema`, which `BUILDER_SNAPSHOT_SCHEMA` in
`packages/tarkov-data/src/snapshot/types.ts` must match. Bump it with any change to the file
shape. A tab opened before a deploy that changed it gets "Game data was updated. Reload the
page." rather than misreading the new file.

## Saved builds

A shared build may name an id the snapshot does not hold: a part gone upstream, or a real item
no weapon slot takes (a cartridge saved into a magazine slot). On load, the Builder moves such
ids off the weapon into the build's orphaned list, where the orphaned-mods banner names them
"not a part the Builder knows". A build whose weapon is gone shows the drift banner.
