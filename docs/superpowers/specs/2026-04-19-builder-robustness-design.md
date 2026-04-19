# Milestone 1.5 — Builder Robustness

**Status:** design approved 2026-04-19 · target version range v1.1.x
**Depends on:** `apps/web` v1.0.0, `apps/builds-api` v0.1.0 (deployed, unwired)
**Supersedes selected items from:** [2026-04-18 rebuild design](./2026-04-18-tarkov-gunsmith-rebuild-design.md) §13 (trader-availability filter pulled up from M3)

## 1. Context

Milestone 1 shipped `/builder` as a functional prototype: a native-select weapon picker, a flat checkbox list of all compatible-or-not mods, and a live `weaponSpec` recompute. The M1 goal of "Weapon Builder + share-URL via builds-api" deliberately deferred the share-URL piece to ship the visible UX sooner. `apps/builds-api` is fully built, tested, and deployed — but no code in `apps/web` calls it.

The flat-mod-list approach makes it structurally possible to attach any mod to any weapon, including nonsense combinations. It also gives the user no sense of which mods they could realistically acquire at their current trader / quest progression.

M1.5 finishes the Builder. It locks correctness (slot-based compatibility), closes the save/share loop promised in M1, introduces player-progression gating (pulled up from M3 because it shares the enrichment pipeline with slot-compat), and polishes UX on top of a correct foundation.

## 2. Goals

- **Correctness.** A user cannot attach a mod to a weapon slot that doesn't accept it.
- **Shareability.** A build can be saved and recovered from a URL. Round-trips are stable even when upstream data shifts.
- **Relevance.** Unavailable items visually differ from available items, with the blocking requirement shown. Users can override with a "show all" toggle.
- **Iterative shipping.** Four independent PRs, each lands in production and delivers user-visible value.

## 3. Non-goals

- `tarkov.dev` profile-import integration — deferred to M3.
- Build comparison, build optimization, OG share cards — remain in M3.
- Drag-to-reorder or visual-assembly preview for the slot tree — future polish.
- Rate limiting on `builds-api` — revisit if abuse is observed.
- Accessibility beyond baseline keyboard navigation — separate pass.

## 4. Arc shape

One umbrella design doc (this file). Four PRs, each with its own implementation plan generated via `superpowers:writing-plans` at execution time so each plan reflects what shipped in earlier PRs.

```
docs/superpowers/specs/2026-04-19-builder-robustness-design.md       ← this file
docs/plans/YYYY-MM-DD-builder-schema-and-save-load-plan.md           ← PR 1
docs/plans/YYYY-MM-DD-builder-slot-compat-plan.md                    ← PR 2
docs/plans/YYYY-MM-DD-builder-progression-gating-plan.md             ← PR 3
docs/plans/YYYY-MM-DD-builder-ux-depth-plan.md                       ← PR 4
```

**Branch strategy.** One `feat/builder-robustness-prN-<slice>` branch per PR off `main`. Squash-merged. No long-lived feature branch.

**Schema version bump per PR.** v1 at PR 1, v2 at PR 2, v3 at PR 3, v4 at PR 4. Versions are cheap; cleanly-separated contracts are not.

## 5. Build-schema evolution

Schema lives in `packages/tarkov-data/src/build-schema.ts` and is consumed by both the SPA and `apps/builds-api` (which currently validates nothing — that stays true; the Worker remains a schema-agnostic opaque key/value store, per `apps/builds-api/CLAUDE.md`). The web app owns schema enforcement.

```ts
// Grows one variant per PR. Never mutates.
export const Build = z.discriminatedUnion("version", [BuildV1, BuildV2, BuildV3, BuildV4]);
```

### 5.1 v1 (PR 1) — flat model, minimum viable

```ts
BuildV1 = z.object({
  version: z.literal(1),
  weaponId: z.string().min(1),
  modIds: z.array(z.string()).max(64),
  createdAt: z.string().datetime(),
});
```

Mirrors the current in-memory state exactly. Saving a live builder session is a 1:1 map.

### 5.2 v2 (PR 2) — slot paths

```ts
BuildV2 = z.object({
  version: z.literal(2),
  weaponId: z.string().min(1),
  attachments: z.record(z.string(), z.string()), // SlotPath → ItemId
  orphaned: z.array(z.string()), // items that couldn't be placed
  createdAt: z.string().datetime(),
});
```

**Migration v1 → v2.** Walk the weapon's slot tree for each `modId`. Unambiguous match (exactly one slot accepts it) → place. Ambiguous (multiple slots would accept) → place in the first in tree order, log in dev. No matching slot → push to `orphaned[]`.

### 5.3 v3 (PR 3) — profile snapshot

```ts
BuildV3 = BuildV2.extend({
  version: z.literal(3),
  profileSnapshot: PlayerProfile.optional(), // opt-in embed at save time
});

PlayerProfile = z.object({
  mode: z.enum(["basic", "advanced"]),
  traders: z.object({
    prapor: z.number().int().min(1).max(4),
    therapist: z.number().int().min(1).max(4),
    skier: z.number().int().min(1).max(4),
    peacekeeper: z.number().int().min(1).max(4),
    mechanic: z.number().int().min(1).max(4),
    ragman: z.number().int().min(1).max(4),
    jaeger: z.number().int().min(1).max(4),
  }),
  flea: z.boolean(),
  completedQuests: z.array(z.string()).optional(), // advanced only
});
```

### 5.4 v4 (PR 4) — name & description

```ts
BuildV4 = BuildV3.extend({
  version: z.literal(4),
  name: z.string().max(60).optional(),
  description: z.string().max(280).optional(),
});
```

### 5.5 Migrations

Pure functions in `packages/tarkov-data/src/build-migrations.ts`:

```ts
migrateV1ToV2(v1: BuildV1, tree: WeaponTree): BuildV2
migrateV2ToV3(v2: BuildV2): BuildV3                  // trivial: add empty profile
migrateV3ToV4(v3: BuildV3): BuildV4                  // trivial: add empty name/desc
```

Each migration has fixture tests with representative inputs captured from each era.

## 6. PR 1 — Schema v1 + save/load

### 6.1 What lands

- `packages/tarkov-data/src/build-schema.ts` with `BuildV1` + the discriminated union.
- `apps/web/src/routes/builder.tsx`: "Share build" button, clipboard toast.
- `apps/web/src/routes/builder.$id.tsx`: loader route that fetches + parses + hydrates state.
- `apps/web/functions/api/builds/[[path]].ts`: CF Pages Function forwarding to the `builds-api` Worker.
- Pages project env var: `BUILDS_API_URL = https://tarkov-gunsmith-builds-api.<subdomain>.workers.dev`.
- `@tarkov/data` hooks: `useSaveBuild()`, `useLoadBuild(id)`.

### 6.2 URL shape

| Route          | Purpose                                                |
| -------------- | ------------------------------------------------------ |
| `/builder`     | Fresh builder. State lives in localStorage as a draft. |
| `/builder/$id` | Load stored build by id.                               |

Inline-URL encoding (`?b=base64…`) is rejected: it freezes old schemas into URLs we can't migrate, splits the storage model, and KV is fast enough that the cost of the round-trip is invisible.

### 6.3 Save flow

1. User clicks "Share build".
2. Current state is assembled into `BuildV1` and validated via `BuildV1.parse()`.
3. `POST /api/builds` with the JSON body.
4. Worker returns `201 { id, url }`.
5. Client copies the URL to clipboard and shows a toast with "Open" and "Copy again" actions.
6. Client does **not** navigate — the current working state and the shared state are identical, so navigation would disrupt the user.

### 6.4 Load flow

1. `/builder/$id` route — TanStack Router loader fires on navigation.
2. `useLoadBuild(id)` → `GET /api/builds/$id`.
3. Response parsed through `Build` discriminated union.
4. If `version < current`, run migrations in sequence.
5. On success → hydrate builder state.
6. On failure → empty-state component with cause-specific messaging.

### 6.5 Error taxonomy

| Cause                                               | Origin                     | UI state                                                                                                                                                                                          |
| --------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build expired or never existed                      | Worker 404                 | "Build not found." Likely expired (30-day TTL). CTA → `/builder`.                                                                                                                                 |
| JSON malformed or schema validation fails           | Parse error on the SPA     | "This build couldn't be loaded." Debug-info copy button. CTA → `/builder`.                                                                                                                        |
| Worker unreachable                                  | Fetch error                | "Couldn't reach build storage." Retry button.                                                                                                                                                     |
| Upstream weapon or mod no longer in tarkov.dev data | Enrichment step on the SPA | **Load partially with a warning banner.** The build is not rejected — the user sees what does still exist with an explicit "some referenced items are no longer in the current game data" header. |

The last row is load-bearing. Schema versioning cannot solve the BSG-removed-an-item case; partial load with a warning is strictly better than rejection.

## 7. PR 2 — Slot-based mod compatibility (schema v2)

### 7.1 Data layer

New hook `useWeaponTree(weaponId)` in `@tarkov/data`. Single GraphQL query against `api.tarkov.dev` pulling the weapon and recursive slot filters. Recursion capped at depth 5 (more than any real weapon configuration needs). Returns a normalized tree:

```ts
type SlotNode = {
  nameId: string; // stable slot identifier from upstream
  name: string; // display
  path: string; // "mod_muzzle/mod_muzzle_adapter"
  allowedItems: Set<string>; // resolved item ids that can be attached here
  children: SlotNode[]; // nested slots (e.g. scope → mount → riser)
  required: boolean;
};
```

Slot paths are `/`-joined `nameId`s — stable across upstream display-name changes.

### 7.2 Migration v1 → v2

See §5.2. Migration runs inside `useLoadBuild` when the parsed build's version is 1. Tests cover:

- **Clean case.** Every v1 mod has exactly one valid slot → all placed, `orphaned` empty.
- **Partial map.** Some mods have no valid slot (e.g. upstream changed compat) → valid ones placed, rest in `orphaned` with a warning banner.
- **Fully orphaned.** No mods can be placed → build loads with just the weapon and a prominent "this older build couldn't be migrated; here's the raw mod list" state.

### 7.3 UI

Flat checklist is replaced by a slot tree. Each row shows a slot name and its current attachment (or `+ empty`). Clicking opens a picker modal filtered to `SlotNode.allowedItems`. Nested slots reveal on expand. The "orphaned mods" bucket appears as a dismissable banner with a list — clicking an orphaned mod opens the picker for any slot that _would_ accept it, giving the user a one-click fix.

Invalid attachments become structurally impossible — the picker only shows items the slot accepts.

## 8. PR 3 — Player-progression gating (schema v3)

### 8.1 Profile editor

Drawer accessed from `/builder` top-right. Two tabs: **Basic** and **Advanced**.

- **Basic.** Seven trader loyalty-level dropdowns (LL 1–4). One flea-market toggle. Nothing else.
- **Advanced.** Everything in Basic, plus a list of ~20 marquee quest toggles curated in `packages/tarkov-data/src/marquee-quests.ts` (_Gunsmith Pt. 1–25_, _Shooter Born in Heaven_, _Psycho Sniper_, _Setup_, _Fishing Gear_, etc. — quest ids pulled from upstream, list is updatable without schema change).

Live profile persists in `localStorage["tg:player-profile"]`.

### 8.2 Availability computation

New hook `useItemAvailability(itemId, profile)` in `@tarkov/data`. For each item walks its `buyFor`, `craftsFor`, and `barterFor` arrays and filters to the paths whose requirements the profile satisfies (trader at required loyalty level, required quest completed if present, flea access if path is flea). Returns:

- `available: true` with the cheapest rouble-denominated satisfying path, or
- `available: false` with the least-demanding blocking requirement (lowest trader LL across unmet paths, or the specific quest id if all paths are quest-gated).

### 8.3 UI

Items the current profile cannot acquire render at ~40% opacity with a compact requirement badge (`Prapor 3`, `Quest: Gunsmith 4`, `Flea only`). Hover reveals a tooltip with the full reason. A global "Show all items" toggle overrides the dimming and hides the badges.

### 8.4 Profile in shared builds

A checkbox on the Save dialog: "Embed my progression snapshot in this shared build." Default off — progression is a privacy choice.

When a shared build carries a `profileSnapshot`, the loaded view shows "This build was shared with profile: Prapor LL2, flea locked…" and offers a "Use my profile instead" toggle.

## 9. PR 4 — UX depth (schema v4)

- **Name & description.** Schema v4 adds optional `name` (≤60 chars) and `description` (≤280). Inline edit on the build header.
- **Slot-tree polish.** Sticky slot-group headers, keyboard nav (j/k to move rows, space to open the picker), quick-pick of recently-attached mods.
- **Preset loadouts.** `packages/tarkov-data/src/presets.ts` — hand-curated `Stock` / `Meta` / `Budget` presets per popular weapon. Applying a preset fills `attachments` fresh (not merged). Adds a `Preset` type.
- **Undo/redo.** History stack in builder state, capped at 50 entries. Cmd-Z / Cmd-Shift-Z.
- **Build-vs-stock diff.** Side card comparing current spec to the bare-weapon spec (`+14 ergo`, `−23% vertical recoil`).

## 10. Transport & infrastructure

The current state per `apps/web/CLAUDE.md`: Vite dev-server proxies `/api/builds/*` to `localhost:8788`, but in production no proxy exists. Prod build requests against `/api/builds/*` would 404.

PR 1 adds `apps/web/functions/api/builds/[[path]].ts` — a Cloudflare Pages Function that forwards to the `builds-api` Worker. The SPA always uses same-origin `/api/builds/...` paths; Vite handles dev, Pages Functions handle prod.

One new Pages env var: `BUILDS_API_URL`, pointing at the Workers.dev URL for the Worker.

## 11. Testing strategy

Per-PR coverage:

| PR  | Unit                                                                                       | Integration                                                                | E2E (Playwright)                                                      |
| --- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1   | `BuildV1` parse/reject fixtures                                                            | `builds-api` round-trip (existing `@cloudflare/vitest-pool-workers` suite) | Save build → copy URL → open URL in fresh context → same state        |
| 2   | v1→v2 migration fixtures (clean/partial/fully-orphaned); slot-tree query normalizer        | `useWeaponTree` against fixture data                                       | Attach mods — only slot-valid items appear in the picker              |
| 3   | Availability per item kind (buyFor / questFor / craftFor); profile localStorage round-trip | Profile-embed → reload round-trip                                          | Set Prapor to LL1 → 7.62 mags dim; toggle "show all" → mags re-enable |
| 4   | Preset loader; undo/redo state machine; `name` / `description` schema validation           | —                                                                          | Apply preset → undo → redo returns to preset state                    |

## 12. Open questions / deferred decisions

- **Marquee quest list composition.** Final list of ~20 quests is a PR 3 deliverable — curated from upstream at implementation time, not now. Design only commits to "roughly 20 high-gating quests."
- **Preset list composition.** Same — curated in PR 4 against whatever weapons are most-shared (telemetry from PR 1 share-URL usage may inform this).
- **Share URL short codes.** `builds-api` currently uses 8-char nanoids. If collisions or guessability become issues, bump to 10 chars and migrate forward; no schema change needed.
- **What qualifies as "unavailable" for flea-locked items when `flea: true` on profile.** First pass: flea access means flea paths count. Edge case: some items are flea-banned regardless of access level. Handle in PR 3 via upstream `item.types` / `item.flea_blacklisted` field.

## 13. References

- [2026-04-18 rebuild design](./2026-04-18-tarkov-gunsmith-rebuild-design.md) — overall project architecture, milestones.
- [`apps/builds-api/CLAUDE.md`](../../../apps/builds-api/CLAUDE.md) — Worker contract.
- [`apps/web/CLAUDE.md`](../../../apps/web/CLAUDE.md) — SPA conventions, Vite proxy state.
- `api.tarkov.dev` GraphQL schema — data source for weapon slots, item compatibility, trader `buyFor`, quest unlocks.
