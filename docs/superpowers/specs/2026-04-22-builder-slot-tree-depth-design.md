# M3.5 Arc 1 — Builder Slot-Tree Depth

**Status:** design approved 2026-04-22. Writing-plans is next.

**Context:** Second arc of M3.5 "Depth & Polish" (Arc 0 shipped as v1.12.0 / PR #100). Arc 1 bundles four Builder slot-tree enrichments into one PR: category-aware slot filtering, crafts/barters surfacing, slot-tree keyboard/sticky polish, and a recursion-depth bump. All four changes center on `apps/web/src/features/builder/slot-tree.tsx` and the `@tarkov/data` queries that feed it.

## Goal

- Let users see **what a slot accepts** even when the upstream exposes it as a category set (not an explicit item list) — today they get a bail-out "(deferred)" message.
- Let users see **whether a mod is craftable or obtainable by barter**, even though Arc 1 won't gate availability on it.
- Let the slot-tree stay readable when deeply nested (keep the active slot's header visible on scroll) and navigable from the keyboard.
- Surface the deeper mod chains (depth 4 and 5) that depth-3 recursion silently drops.

## Non-goals

- **A2 — Category-filtered item picker.** Rendering a picker of all items matching `allowedCategories`. Big UX design + a new "items by category" GraphQL query; revisit if the label-only flavor proves insufficient.
- **B2 — Full crafts/barters gating in `itemAvailability`.** Walking the recipe/barter for ingredient availability + station/trader gates. Reshapes the `ItemAvailability` contract and has its own test matrix; deferred.
- Keyboard shortcut overlay — that's Arc 2.
- Focus-trap / custom focus-ring tuning — relies on existing Field Ledger styles.
- Hover detail for `CRAFT` / `BARTER` Pills (showing station/trader/level). Future enhancement if informational Pills prove valuable.
- Dialog primitive migration, favicon, skeleton shimmers — Arc 2.

## Design

### 1. Recursion depth 3 → 5 (scope D)

Flip `RECURSION_DEPTH` in `packages/tarkov-data/src/queries/weaponTree.ts` from `3` to `5`.

Risk: upstream response size grows with depth. Most weapon mod chains top out at 3–4 levels; a handful of muzzle-device-into-suppressor-into-endcap chains reach 5. Response budget target: **< 250 KB** for a representative weapon (e.g. M4A1). If a real weapon blows that budget, the plan revisits depth 4 as a fallback before merging.

Verification happens via:

- An existing invalid-empty-selection-set parse test (memory calls this out as load-bearing — depth change must not reintroduce empty `slots {}` at leaf depth).
- A new response-size probe in tests using the live upstream or a refreshed fixture.

### 2. `allowedCategories` — label-only (scope A1)

**GraphQL — extend `buildSlotSelection`:**

```graphql
filters {
  allowedItems { ... }                     # already there
  allowedCategories {                      # NEW
    id
    name
    normalizedName
  }
}
```

**Normalizer — extend `SlotNode`:**

```ts
export interface SlotCategory {
  readonly id: string;
  readonly name: string;
  readonly normalizedName: string;
}

export interface SlotNode extends SlotNodeForMigration {
  // ... existing fields
  readonly allowedCategories: readonly SlotCategory[]; // NEW (always present; empty array when upstream omits)
}
```

`normalizeSlots` populates it from `s.filters?.allowedCategories ?? []`. Empty slots today (no items, no categories, e.g. purely placeholder sockets) will simply have `allowedCategories.length === 0`.

**UI — `slot-tree.tsx`:**

When a slot's `<details>` is open and `slot.allowedItems.length === 0`:

- If `slot.allowedCategories.length > 0`: render an info block in the expanded slot body:
  ```
  ACCEPTS · Weapon scopes · Iron sights · …
  ```
  Field Ledger mono styling, no interactivity.
- Else: fall back to today's `No explicit allowed items — category-based slot (deferred).` message (updated to `No explicit allowed items or categories.` to reflect that categories now would have been shown if present).

### 3. `craftsFor` / `bartersFor` — informational pills (scope B1)

**GraphQL — extend `modList.ts` query:**

```graphql
craftsFor {
  id
  station {
    normalizedName
    level
  }
}
bartersFor {
  id
  level
  trader {
    normalizedName
  }
}
```

Exact field names verified against `packages/tarkov-types/src/generated/schema.graphql` during plan execution. If shapes differ, the plan steps handle the discrepancy.

**Schema — `modListItemSchema`:**

```ts
const craftReferenceSchema = z.object({
  id: z.string(),
  station: z.object({
    normalizedName: z.string(),
    level: z.number().int(),
  }),
});

const barterReferenceSchema = z.object({
  id: z.string(),
  level: z.number().int(),
  trader: z.object({ normalizedName: z.string() }),
});

const modListItemSchema = z.object({
  // ... existing fields
  craftsFor: z.array(craftReferenceSchema).nullable(), // NEW
  bartersFor: z.array(barterReferenceSchema).nullable(), // NEW
});
```

Both are `.nullable()` to match `buyFor`'s precedent and tolerate upstream nulls.

**`ItemAvailability` / `itemAvailability()`:** unchanged. Scope choice B1 is explicit here — crafts/barters are informational only, do not participate in the available/unmet-requirement decision.

**UI — `slot-tree.tsx`:**

Each item row already shows one `<AvailabilityPill>`. It now also optionally shows:

- `CRAFT` — when `item.craftsFor && item.craftsFor.length > 0`
- `BARTER` — when `item.bartersFor && item.bartersFor.length > 0`

Both use `Pill` with `tone="muted"` (existing Field Ledger tone — grey text + border, no color accent). Rendered in the `<div className="flex items-center gap-2 flex-shrink-0">` block, between the optional `requirementLabel` and the availability Pill. Multiple Pills can coexist on a single item.

Note: the slot-tree consumes a `ModListItem` shape via `getAvailability`, but today doesn't have the full mod item in the `allowedItems` embedded tree — the embedded tree only carries `{ id, name, children }` (see `AllowedItem` in `weaponTree.ts`). The UI needs a way to read `craftsFor` / `bartersFor` per item. Two options:

- **Preferred:** hoist a second getter from the Builder route into `SlotTree`. The Builder already has a `ModListItem`-by-id map via `useModList` (for `getAvailability`). Add a parallel `getModSources(itemId)` returning `{ hasCraft: boolean, hasBarter: boolean }`. Cheap to derive, keeps `SlotTree` ignorant of the full `ModListItem` shape.
- Rejected: extending `AllowedItem` to carry the crafts/barters — couples the weapon-tree response to data that belongs to the mod-list response.

### 4. Slot-tree polish — sticky headers + keyboard nav (scope C)

**Sticky headers:** apply `position: sticky; top: 0` to top-level slot `<summary>` rows. Nested slot summaries stay non-sticky (keeps CSS out of depth-aware offset math; still visually clear because the top-level parent is the anchoring context).

Implementation detail: `<summary>` inside a `<details>` can be made sticky; the stacking order needs a `z-10` and a solid background (`bg-[var(--color-background)]`) so content doesn't bleed through when the row sticks. The slot-tree container must also be a scroll container — verify `overflow-y: auto` + a `max-height` or parent scroll context is present; add if missing.

**Keyboard nav:** `onKeyDown` handler on the root `<ul>`:

| Key               | Behavior                                                                             |
| ----------------- | ------------------------------------------------------------------------------------ |
| `ArrowDown`       | Move focus to next focusable element in the tree (summary or item button), DOM order |
| `ArrowUp`         | Move focus to previous focusable element                                             |
| `ArrowRight`      | If focused on a closed `<summary>`, open its `<details>`                             |
| `ArrowLeft`       | If focused on an open `<summary>`, close its `<details>`                             |
| `Enter` / `Space` | Native — already toggles `<details>` or clicks the item button                       |
| `Tab`             | Native — unchanged, still cycles through focusables                                  |

Focus-target enumeration: `root.querySelectorAll("summary[data-slot-path], [data-slot-path] > div button")`. Skipped elements: the "None" button within a picker list IS a focusable button and stays in the flat list. Index via `Array.from(targets).indexOf(document.activeElement)`; wrap at boundaries (no-wrap on ArrowUp from index 0 / ArrowDown from last — let browser default scroll behavior kick in; no wrapping).

No new hook file — inline handler keeps the change scoped.

## Architecture

```
Tarkov Gunsmith Builder
    │
    ├─ packages/tarkov-data
    │   ├─ queries/weaponTree.ts          ← depth 5, allowedCategories
    │   │   └─ SlotNode, SlotCategory, normalizeSlots
    │   └─ queries/modList.ts              ← craftsFor, bartersFor
    │       └─ ModListItem schema
    │
    └─ apps/web/src/features/builder
        └─ slot-tree.tsx                    ← 4 UI changes (category label,
                                              pills, sticky, keyboard)
```

Zero changes to `@tarkov/ui` (existing `muted` Pill tone suffices).
Zero changes to `itemAvailability()`.
Zero new dependencies.

## File map

**Modified:**

| Path                                                                             | Change                                                                            |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `packages/tarkov-data/src/queries/weaponTree.ts`                                 | `RECURSION_DEPTH: 3 → 5`; `allowedCategories` in fragment, types, normalizer      |
| `packages/tarkov-data/src/queries/weaponTree.test.ts`                            | Normalizer cases for `allowedCategories`; depth-5 parse coverage                  |
| `packages/tarkov-data/src/queries/__fixtures__/weaponTree.json`                  | Refresh (includes `allowedCategories` + extra depth)                              |
| `packages/tarkov-data/src/queries/modList.ts`                                    | `craftsFor` / `bartersFor` fragments + schema                                     |
| `packages/tarkov-data/src/queries/modList.test.ts`                               | Parse coverage for both new arrays                                                |
| `packages/tarkov-data/src/queries/__fixtures__/modList.json`                     | Refresh                                                                           |
| `packages/tarkov-data/src/index.ts`                                              | Export `SlotCategory`; re-export updated `ModListItem`                            |
| `apps/web/src/routes/builder/$id.tsx` _and/or_ `apps/web/src/routes/builder.tsx` | Wire a `getModSources(itemId)` prop into `<SlotTree>`                             |
| `apps/web/src/features/builder/slot-tree.tsx`                                    | Category label; craft/barter pills; sticky; keyboard handler                      |
| `apps/web/e2e/smoke.spec.ts`                                                     | ArrowDown focus-movement smoke + (if feasible) sticky-header visible after scroll |

## Testing

**Unit (`@tarkov/data`):**

- `weaponTree.test.ts` — normalizer populates `allowedCategories` when upstream provides them; empty when not; query string passes GraphQL `parse()` validation (prevents regression of the "empty `slots {}` at leaf" class of bugs); the depth-5 fragment correctly terminates with no inner properties at the leaf.
- `modList.test.ts` — a fixture item with populated `craftsFor` and `bartersFor` parses; a fixture item with nulls parses; mixed cases.

**E2E (`apps/web/e2e/smoke.spec.ts`):**

- Focus the first top-level slot `<summary>`, press `ArrowDown` once, assert `document.activeElement` changed to the next summary or button.
- (Stretch) Open a top-level slot, scroll the slot-tree container, assert the open `<summary>` is still in viewport (sticky assertion via bounding rect).

No visual-regression assertions; layout tweaks stay inside the Field Ledger aesthetic and the existing smoke font-load test already covers the aesthetic baseline.

## Rollout

One PR on branch `feat/m3.5-arc-1-builder-depth` (already created). Commits roughly:

1. `feat(data): weaponTree allowedCategories + depth 3→5`
2. `feat(data): modList craftsFor + bartersFor fragments`
3. `feat(builder): category label + craft/barter pills`
4. `feat(builder): sticky slot headers + keyboard arrow nav`
5. `test(e2e): keyboard nav smoke`

Squash-merge. `feat(data):` and `feat(builder):` will each drive a minor bump per release-please semantics — collected under one release.

## Risks & open questions

- **GraphQL field names for craftsFor/bartersFor.** The spec lists the shape I expect (`station.normalizedName`, `station.level`, `trader.normalizedName`, `level`). If tarkov-api's schema differs, the plan handles the discrepancy inline (read the schema, adjust the fragment + zod schema together). Not a blocker.
- **Response size at depth 5.** 250 KB is the mental budget. Depth 5 may expose a single outlier weapon that balloons. Fallback: keep depth 4 if the perf pushback is real. The plan records the actual measured sizes for at least two representative weapons.
- **Sticky header stacking.** If the slot-tree isn't already a scroll container, `position: sticky` is a no-op. The plan verifies this early and adds a container `overflow-y: auto` + `max-height` if needed. Side-effect risk: the max-height changes the page layout rhythm — worth a manual smoke.
- **Keyboard nav + `<details>` interactions.** Native `<details>` opens on Enter/Space when `<summary>` is focused, which can collide with ArrowLeft/Right expectations if a user presses Enter after using arrows. Design accepts this: Enter toggles the open state (native), arrows explicitly open/close — both paths land the same result.
- **Fixture refresh quirks.** The `weaponTree` fixture has to be re-recorded against the live upstream to capture the new fields. Any transient upstream schema drift lands in the fixture — plan snapshots the fixture's `__typename` union lines and diffs them manually before committing.

## Follow-ups outside this arc

- A2 (category-filtered item picker) — separate arc if the label-only UX turns out to be insufficient.
- B2 (full craft/barter gating in `itemAvailability`) — separate arc; would change the `ItemAvailability` TS union.
- Hover details on `CRAFT` / `BARTER` pills (tooltip with station/trader + level) — trivial follow-up if informational pills earn their keep.
- Variable-depth sticky headers (nested slots also stick with top-offset stacks) — if UX feedback says top-level-only isn't enough.
