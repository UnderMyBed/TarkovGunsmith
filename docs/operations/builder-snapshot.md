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

`dataAsOf` is the newest `updated` timestamp in the items document. The Builder's weapon panel
shows it as "Game data · <date>".

## Where the data comes from

`apps/web/scripts/builder-snapshot.ts` writes both files into `apps/web/public/data/`
(gitignored), which Vite copies into `dist/`. It runs first in `pnpm --filter @tarkov/web build`
and `pnpm --filter @tarkov/web dev`. `TARKOV_SNAPSHOT_SOURCE` picks the documents:

| Value                | Documents                                                | Used by                           |
| -------------------- | -------------------------------------------------------- | --------------------------------- |
| `fixtures` (default) | The captures in `packages/tarkov-data/src/__fixtures__/` | Local dev, CI, the e2e suite      |
| `upstream`           | Live `json.tarkov.dev`                                   | The release deploy (`deploy.yml`) |

Each file records its `source`. The deploy asserts `"source": "upstream"` on both files before
deploying, and the post-deploy smoke job asserts it again on the served snapshot.

A fixture build holds only the captured weapons (the M4A1 and the PM).

```bash
pnpm --filter @tarkov/web snapshot                                  # fixtures
TARKOV_SNAPSHOT_SOURCE=upstream pnpm --filter @tarkov/web snapshot  # live
```

## When generation fails

Generation is strict. Every weapon, part, barter, trader and task must match its schema; every
item a weapon's slots reach must be a part; two copies of one trader offer must agree on price.
Any failure stops the build and lists every problem, one line each:

```
upstream data no longer matches the Builder's schemas (2 problems):
  - items/<id> (ItemPropertiesBarrel): conflictingSlotIds: Invalid input: expected array, received undefined
  - ...
```

In the release deploy this fails the `pages` job's build step, before anything deploys;
production keeps the previous release. To handle it:

1. Run `pnpm verify:upstream` locally. It runs the same generation against live data, plus the
   size budget below, and prints the same problems.
2. Decide per problem whether upstream changed shape (update the schema in
   `packages/tarkov-data/src/queries/`, and recapture the fixture per the fixtures README) or
   sent a bad record (wait for upstream to correct it).
3. Ship the fix as a PR, then merge the release PR again.

## Size budget

Every Builder visit downloads the snapshot. `pnpm verify:upstream` fails when it exceeds
**250 KB brotli** or **4.5 MB raw**, and reports its `JSON.parse` time without gating on it.

## Version

Both files carry `schema`, which `BUILDER_SNAPSHOT_SCHEMA` in
`packages/tarkov-data/src/snapshot/types.ts` must match. Bump it with any change to the file
shape. A tab opened before a deploy that changed it gets "Game data was updated. Reload the
page." rather than misreading the new file.

## Saved builds

A shared build may name a part a later snapshot no longer holds. On load, the Builder moves
such ids off the weapon into the build's orphaned list, where the orphaned-mods banner names
them "no longer in the game data". A build whose weapon is gone shows the drift banner.
