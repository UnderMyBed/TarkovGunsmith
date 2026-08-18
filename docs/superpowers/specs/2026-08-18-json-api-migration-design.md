# Migration off the GraphQL API onto json.tarkov.dev

**Status:** design approved (drafted 2026-08-18). Writing-plans is next.

**Context:** `https://api.tarkov.dev/graphql` has returned `GraphQL server unavailable` continuously
since roughly **2026-07-21**. Upstream issue
[the-hideout/tarkov-api#474](https://github.com/the-hideout/tarkov-api/issues/474) is still open a
month later; a maintainer's answer there is unambiguous: _"The GraphQL API is down for the moment,
but you have the Json API who alive (https://json.tarkov.dev/endpoints). Tarkov.dev is based on
this Json API and not on the GraphQL."_

`apps/web/src/tarkov-client.ts` hard-pins the dead GraphQL endpoint, so **every route on the
deployed site is currently without data**. This is not a refactor — it is restoring a broken
production site. All other work is stopped until it lands.

## Goal

Restore data to all 8 routes by moving the data layer onto `json.tarkov.dev`, preserving every
existing domain type so hooks, routes, and the e2e suite are unchanged and act as the regression
test.

### Success criteria

1. No code outside `packages/tarkov-data` knows the transport. `graphql-request` is gone from the
   dependency tree.
2. Every existing exported domain type from `packages/tarkov-data` (`AmmoListItem`, `ArmorListItem`,
   `ModListItem`, weapon/tree/task/trader types) keeps its exact shape. Hooks and routes are not
   modified except where §4 requires it.
3. `pnpm --filter @tarkov/web test:e2e` passes with live data, including the console-error gate.
4. Progression gating works against the restructured Gunsmith quests (§4).
5. Existing shared builds keep their unlocks — `completedQuests` is migrated, not silently dropped.
6. Ships as four arcs, one PR each (§1).

## The upstream contract (measured 2026-08-18)

```
GET https://json.tarkov.dev/{gameMode}/{resource}        -> { data, translations: [JSONPath, ...] }
GET https://json.tarkov.dev/{gameMode}/{resource}_{lang} -> { data: { "<key>": "<translated>" } }
```

Game modes: `regular`, `pve`, `pvp-season`. Languages: 19, including `en`.

Text fields in the main document are **translation keys**, not text (`"<id> Name"`). The client
walks each JSONPath in `translations` and substitutes from the `_{lang}` document, falling back to
`en`, then to the raw key. This is exactly what `the-hideout/tarkov-dev/src/modules/api-request.mjs`
does, and it is the reference implementation for §2.

Measured payloads: `/regular/items` 16.7 MB raw / **1.36 MB gzipped**, 5312 items;
`/regular/items_en` **392 KB**; `/regular/tasks` 205 KB; `/regular/traders` small.

Coverage against what this project needs — verified by inspecting the live payload:

| Need            | Status                                                                                                                                                                                                                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ammo ballistics | **Superset.** 200 cartridges with `penetrationPower`, `damage`, `armorDamage`, `fragmentationChance`, `penetrationChance`, `ricochetChance`, `penetrationPowerDeviation`, `initialSpeed` — plus `ballisticCoeficient`, `bulletMassGrams`, `bulletDiameterMilimeters`, which GraphQL never exposed. |
| Armor           | 326 items with `class`, `durability`, `material`, `bluntThroughput`, `zones`, `armorSlots`, `ergoPenalty`.                                                                                                                                                                                         |
| Weapons         | 171 guns with `slots`, `caliber`, `ergonomics`, `recoilVertical`/`recoilHorizontal`, `fireRate`, `allowedAmmo`, `defaultPreset`, **`presets`**.                                                                                                                                                    |
| Mods            | `slots`, `ergonomics`, `recoilModifier`, `accuracyModifier`, `conflictingItems`.                                                                                                                                                                                                                   |
| Tasks / traders | 517 tasks, all traders. See §4 — the Gunsmith series was restructured.                                                                                                                                                                                                                             |

## Framing decisions (locked during brainstorming)

| Decision          | Choice                                                                                                                                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Payload strategy  | Client fetches the whole document and slices locally. No server-side slicing; `data-proxy` stays out of the request path. Simplest, no deploy on the critical path, fastest restoration.                        |
| Domain types      | Frozen. Every existing Zod-validated output type keeps its shape, which makes hooks, routes, and e2e the regression test for the migration.                                                                     |
| Game mode         | `regular` only. `pve` / `pvp-season` are a follow-up (§6).                                                                                                                                                      |
| Gunsmith quests   | Adopt **all 26**. The marquee list goes 20 -> 36.                                                                                                                                                               |
| Saved builds      | A `BuildV5` migration remaps `gunsmith-part-N` -> `gunsmith-master-part-N`. Unknown quest names are preserved, never dropped.                                                                                   |
| Translation merge | Generic, driven by the upstream `translations` JSONPath array via `jsonpath-plus`, rather than hard-coding field names. Upstream adds paths without warning; a hard-coded list would silently stop translating. |
| Language          | `en` only. The upstream fallback chain still applies.                                                                                                                                                           |

## Non-goals

- No server-side slicing, no `data-proxy` in the request path, no KV caching of upstream data.
- No `pve` / `pvp-season` selector.
- No non-English languages.
- No new routes, no visual redesign. The profile editor changes only as far as 36 quests require.
- No adoption of the newly-available ballistics fields (`ballisticCoeficient`, `bulletMassGrams`).
  They are recorded in §6 as a genuine opportunity; using them changes ballistics math and belongs
  in its own spec with its own verification against the C# reference.
- No fix for the security arcs parked mid-flight. They resume after this lands.

## Design

### 1. Arc sequencing

| Arc | Branch                           | Contents                                                                                                |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | `feat/json-api-transport`        | JSON client, document fetch, translation merge, provider wiring. No route changes.                      |
| 2   | `feat/json-api-item-queries`     | The six item-derived queries rewritten as selectors. **Production is restored at the end of this arc.** |
| 3   | `feat/json-api-tasks-and-quests` | Tasks, traders, 36 marquee quests, `BuildV5`, profile-editor grouping.                                  |
| 4   | `chore/retire-graphql`           | Delete `graphql-request`, the GraphQL codegen in `packages/tarkov-types`, and `apps/data-proxy`.        |

Arc 2 is the one that matters. Arcs 3 and 4 are correctness and hygiene on top of a working site.

### 2. Arc 1 — transport and the cached document

`packages/tarkov-data/src/client.ts` loses `graphql-request` and gains a JSON client:

```ts
export interface TarkovJsonClient {
  /** Fetch one resource, with its translations already merged. */
  fetchResource<T>(resource: string): Promise<T>;
}

export function createTarkovClient(baseUrl: string, fetchImpl?: typeof fetch): TarkovJsonClient;
```

`createTarkovClient` keeps its name and its position in `apps/web/src/tarkov-client.ts`, so the only
change there is the constant: `https://json.tarkov.dev/regular/` in place of the GraphQL URL.

`fetchResource` issues two requests in parallel — `{resource}` and `{resource}_en` — then merges.
The merge is generic: for each JSONPath string in the response's `translations` array, resolve it
with `jsonpath-plus` and replace each matched value with `translations[value] ?? value`. A missing
translation leaves the key in place rather than throwing, matching upstream behaviour.

The document is fetched **once** and shared. A single TanStack Query entry under
`["tarkov", "items"]` holds the parsed items document; every item-derived hook in Arc 2 reads from
that one entry rather than issuing its own fetch. `staleTime` is 1 hour — upstream regenerates on
roughly a daily cadence, and a calculator does not need fresher data than that.

**Failure behaviour:** a non-OK response or a parse failure rejects with a typed error carrying the
resource name and status. The existing per-route error UI surfaces it unchanged; this arc adds no
new error surfaces.

### 3. Arc 2 — item queries as selectors

Each of `ammoList`, `armorList`, `modList`, `weapon`, `weaponList`, `weaponTree` currently exports a
GraphQL string, Zod schemas, and `fetchX(client)`. After this arc each exports the **same Zod
schemas and the same output type**, with the query string replaced by a selector over the items
document.

The existing per-item `safeParse`-and-drop discipline is kept verbatim. It is more valuable here
than it was under GraphQL: the JSON document mixes every item type in one map, so selecting "ammo"
means filtering 5312 items by `types` and validating each.

Two upstream shape differences to absorb inside the query layer, invisible to callers:

- `data.items` is an **object keyed by id**, not an array. Selectors call `Object.values` once.
- GraphQL's `properties.__typename` discriminator is `properties.propertiesType` here. The Zod
  discriminators change accordingly; the parsed output type does not.

#### 3.1 `buyFor` becomes a cross-resource join

This is the one place the upstream shape genuinely lost information rather than moving it.
GraphQL embedded the resolved vendor:

```graphql
buyFor { priceRUB currency vendor { normalizedName minTraderLevel taskUnlock { normalizedName } } }
```

The JSON API returns bare ids instead:

```json
{
  "trader": "5a7c2eca46aef81a7ca2145d",
  "priceRUB": 22997,
  "currency": "RUB",
  "minTraderLevel": 3,
  "taskUnlock": null,
  "buyLimit": 5
}
```

So `buy-for.ts` must join `buyFromTrader[].trader` against `/traders` and `.taskUnlock` against
`/tasks` to recover the `normalizedName` values `itemAvailability` matches on. Flea availability is
no longer a `FleaMarket` vendor entry — it is the item's top-level `minLevelForFlea`.

That join is why `/tasks` and `/traders` are fetched in **Arc 2** rather than Arc 3: availability
gating is part of a working Builder, and it cannot be expressed without them. Arc 3 is then purely
the quest restructure.

The join happens once, inside the query layer, producing the existing `buyFor`-shaped output. No
consumer learns that the upstream shape changed.

### 4. Arc 3 — tasks, traders, and the Gunsmith restructure

`/regular/tasks` and `/regular/traders` are separate resources and reuse Arc 1's `fetchResource`,
each with its own TanStack key.

**The restructure.** Measured against live data: of the 20 curated marquee quests, 10 survive
unchanged (`eagle-eye`, `fishing-gear`, `psycho-sniper`, `setup`, `shooter-born-in-heaven`,
`the-tarkov-shooter-part-1` through `-5`). The 10 `gunsmith-part-N` entries **no longer exist**.
Upstream now has 26 Gunsmith tasks: `gunsmith-master-part-1` through `-13`, plus 13 weapon-specific
ones (`gunsmith-m4a1`, `gunsmith-akm`, `gunsmith-aks-74n`, `gunsmith-aks-74u`, `gunsmith-as-val`,
`gunsmith-ak-105`, `gunsmith-hk-mp5`, `gunsmith-model-870`, `gunsmith-mp-133`, `gunsmith-mpx`,
`gunsmith-op-sks`, `gunsmith-p226r`, `gunsmith-vector-9x19`).

All 26 are adopted, taking `MARQUEE_QUEST_NORMALIZED_NAMES` from 20 to 36.

**Profile editor.** 36 flat checkboxes is a worse control than 20 was. The editor groups them under
three headings — `GUNSMITH · MASTER` (13), `GUNSMITH · WEAPON` (13), `OTHER` (10) — preserving the
existing checkbox interaction and Field Ledger styling. No new primitive.

**`BuildV5`.** `build-schema.ts:53` persists `completedQuests` as raw strings, and builds live in KV
behind share URLs. Every build saved before this change stores `gunsmith-part-N`, which after the
rename matches no task — the unlocks would silently disappear rather than error. So:

```ts
export function migrateV4ToV5(v4: BuildV4): BuildV5;
```

It rewrites `gunsmith-part-N` -> `gunsmith-master-part-N` for N in 1..10 and leaves every other
entry untouched, including names it does not recognise. `CURRENT_BUILD_VERSION` becomes `5`.
Unknown quest names are **preserved, never dropped** — a future upstream rename must not silently
erase a user's saved progress a second time.

### 5. Testing

The migration's regression test already exists. Because §3 freezes the domain types, the full
existing unit suite and the e2e suite both apply unchanged, and e2e is meaningful again now that
upstream data is alive.

Added coverage:

- Arc 1: translation merge against a fixture with a nested `translations` JSONPath array, including
  a key with no translation (must pass through unchanged) and a missing `_en` document.
- Arc 2: one selector test per query asserting the parsed output matches the pre-migration domain
  type, plus a mixed-type fixture proving invalid items are dropped rather than failing the call.
- Arc 3: `migrateV4ToV5` over a build containing `gunsmith-part-3`, an already-migrated name, and an
  unrecognised name; a test asserting all 36 marquee names resolve against a live-shaped tasks
  fixture.
- e2e: the existing `ROUTES` sweep is sufficient; no new spec files.

Fixtures are captured from the live API and committed, so the suite does not depend on upstream
being up — the failure mode this whole spec exists to answer.

### 6. Follow-up items (explicitly deferred)

- `pve` and `pvp-season` game modes; the JSON API supports them and GraphQL never did.
- Non-English languages — the transport already handles them, only the UI is missing.
- Adopting `ballisticCoeficient`, `bulletMassGrams`, `bulletDiameterMilimeters` for real drag
  modelling. Genuinely new capability; needs its own spec and verification against the C# reference.
- Weapon `presets` content, which the JSON API supplies and the deferred M1.5 `PresetPicker` wanted.
- `allowedCategories` slot filtering — another deferred M1.5 item. `slot.filters` now carries
  `allowedCategories`, `excludedCategories` and `excludedItems` alongside `allowedItems`, so the
  data is present the moment Arc 2 lands; only the filtering logic is missing.
- `crafts` / `barters` resources, which close out the deferred `craftsFor` / `bartersFor` work.
- Re-pointing `data-proxy` at the JSON API as an edge cache, if client-side payloads prove too heavy.
- Resuming the parked repo-security arcs (T, 0, 1 committed; 2 and 3 unstarted).
