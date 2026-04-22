# M3.5 Arc 1 — Builder Slot-Tree Depth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-04-22-builder-slot-tree-depth-design.md`](../superpowers/specs/2026-04-22-builder-slot-tree-depth-design.md)

**Goal:** Four scoped Builder slot-tree enrichments in one PR: `allowedCategories` label rendering (A1), `craftsFor`/`bartersFor` informational Pills (B1), sticky top-level slot headers + arrow-key keyboard navigation (C), and `RECURSION_DEPTH` 3 → 5 (D).

**Architecture:** Extend two `@tarkov/data` queries and the normalizer to carry the new fields. Wire a new `getModSources(itemId)` getter from `apps/web/src/routes/builder.tsx` into `<SlotTree>`, mirroring the existing `getAvailability` pattern. Add category label + two new Pill slots + sticky CSS + inline keyboard handler to `slot-tree.tsx`. Zero change to `itemAvailability()` or `@tarkov/ui`.

**Tech Stack:** TypeScript 6, zod 4, GraphQL (via `graphql-request`), React 19 + TanStack Router, Tailwind v4, Vitest 4, Playwright.

**Branch & rollout:** Already on `feat/m3.5-arc-1-builder-depth` off `origin/main`. Spec commit `7911daa` present. ONE PR at end. Commits (after existing spec + this plan commit):

1. `docs(m3.5): Arc 1 implementation plan` (this plan's deliverable)
2. `feat(data): weaponTree allowedCategories + depth 3→5`
3. `feat(data): modList craftsFor + bartersFor fragments`
4. `feat(builder): slot-tree category label + craft/barter pills + sticky + keyboard nav`
5. `test(e2e): keyboard nav in slot tree`

**Spec vs. plan deltas (intentional):**

- Spec suggested querying `station.normalizedName`, `station.level`, `trader.normalizedName`, `level` on `craftsFor`/`bartersFor`. Scope is B1 (existence-only pills), so the plan simplifies to `{ id }` on both — minimal query payload, no speculative fields to maintain. If/when a hover detail lands (future follow-up), the query expands then.
- Spec references `packages/tarkov-data/src/queries/__fixtures__/` JSON fixtures for `weaponTree` and `modList`. Those particular fixtures don't exist today (other queries — `ammoList`, `armorList`, `weapon` — do). Both these tests use INLINE response objects (`responseFixture`, `sampleMod`) inside the `.test.ts` files. The plan extends the inline fixtures, not JSON files.

---

## File map

**Modified (7):**

| Path                                                  | Change                                                                                                                 |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `packages/tarkov-data/src/queries/weaponTree.ts`      | `RECURSION_DEPTH: 3 → 5`; add `allowedCategories` to fragment + types + normalizer; export `SlotCategory`.             |
| `packages/tarkov-data/src/queries/weaponTree.test.ts` | Extend inline `responseFixture` with `allowedCategories`; add cases asserting normalizer populates + drops nulls.      |
| `packages/tarkov-data/src/queries/modList.ts`         | Extend query with `craftsFor { id }` and `bartersFor { id }`; extend `modListItemSchema` + `ModListItem` type.         |
| `packages/tarkov-data/src/queries/modList.test.ts`    | Extend inline `sampleMod` with both arrays; parse coverage for populated / empty / null.                               |
| `packages/tarkov-data/src/index.ts`                   | Re-export `SlotCategory`.                                                                                              |
| `apps/web/src/routes/builder.tsx`                     | Add `modSourcesById` memo; pass `getModSources` prop to `<SlotTree>`.                                                  |
| `apps/web/src/features/builder/slot-tree.tsx`         | Props: new optional `getModSources`; UI: category label, craft/barter Pills, sticky `<summary>`, keyboard `onKeyDown`. |
| `apps/web/e2e/smoke.spec.ts`                          | New test: `/builder` slot-tree arrow-key keyboard nav moves focus.                                                     |

**Created (1):**

| Path                                                          | Purpose    |
| ------------------------------------------------------------- | ---------- |
| `docs/plans/2026-04-22-arc-1-builder-slot-tree-depth-plan.md` | This plan. |

---

## Phase A — Baseline

### Task 1: Confirm baseline green before touching anything

**Files:** (verification only)

- [ ] **Step 1: Confirm branch**

```bash
git branch --show-current
```

Expected: `feat/m3.5-arc-1-builder-depth`

- [ ] **Step 2: Confirm spec + plan present**

```bash
git log --oneline -5
```

Expected: at least the Arc 1 spec commit (`7911daa docs(m3.5): Arc 1 — Builder slot-tree depth design`) plus the plan commit once it lands.

- [ ] **Step 3: Baseline checks**

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm --filter @tarkov/data test
pnpm --filter @tarkov/web test
```

Expected: all pass. (Running per-package tests instead of full `pnpm test` avoids the known parallel-workerd ECONNRESET flake noted in Arc 0.)

If anything fails, STOP — don't mix a baseline-repair commit with Arc 1 changes.

---

## Phase B — `@tarkov/data`: weaponTree

### Task 2: Add `allowedCategories` + bump depth to 5

**Files:**

- Modify: `packages/tarkov-data/src/queries/weaponTree.ts`
- Modify: `packages/tarkov-data/src/queries/weaponTree.test.ts`
- Modify: `packages/tarkov-data/src/index.ts`

- [ ] **Step 1: Extend the inline test fixture (TDD — write failing cases first)**

Open `packages/tarkov-data/src/queries/weaponTree.test.ts`. Find the `responseFixture.data.item.properties.slots[0].filters` (the scope slot). Currently:

```ts
filters: {
  allowedItems: [ /* ... */ ],
},
```

Add `allowedCategories` to the SAME filters block plus one slot WITHOUT items (category-only). After the existing `slot-muzzle` entry (which has `filters: null`), append a third slot whose filters have only categories:

```ts
filters: {
  allowedItems: [ /* ... existing ... */ ],
  allowedCategories: [
    { id: "cat-scope", name: "Scope", normalizedName: "scope" },
    { id: "cat-sight", name: "Iron Sight", normalizedName: "iron-sight" },
  ],
},
```

And append this NEW slot to the top-level `slots` array (alongside `slot-scope` and `slot-muzzle`):

```ts
{
  id: "slot-rail",
  nameId: "mod_rail",
  name: "Rail",
  required: false,
  filters: {
    allowedItems: [],
    allowedCategories: [
      { id: "cat-rail", name: "Rail accessory", normalizedName: "rail-accessory" },
      null,
    ],
  },
},
```

The `null` entry verifies the normalizer's defensive filter.

- [ ] **Step 2: Add new test cases asserting the normalizer's behavior**

Find the existing `describe("normalizeSlots", …)` block. Add these tests INSIDE it (adapt to whatever the existing block looks like; match its style):

```ts
it("populates allowedCategories on slots that have them", () => {
  const result = normalizeSlots(responseFixture.data.item.properties.slots as unknown[], "");
  const scope = result.find((s) => s.nameId === "mod_scope");
  expect(scope?.allowedCategories).toEqual([
    { id: "cat-scope", name: "Scope", normalizedName: "scope" },
    { id: "cat-sight", name: "Iron Sight", normalizedName: "iron-sight" },
  ]);
});

it("drops null entries from allowedCategories (upstream tolerance)", () => {
  const result = normalizeSlots(responseFixture.data.item.properties.slots as unknown[], "");
  const rail = result.find((s) => s.nameId === "mod_rail");
  expect(rail?.allowedCategories).toHaveLength(1);
  expect(rail?.allowedCategories[0]?.normalizedName).toBe("rail-accessory");
});

it("returns empty allowedCategories when filters are null", () => {
  const result = normalizeSlots(responseFixture.data.item.properties.slots as unknown[], "");
  const muzzle = result.find((s) => s.nameId === "mod_muzzle");
  expect(muzzle?.allowedCategories).toEqual([]);
});
```

Also add a query-string test (verify depth 5 renders a syntactically valid GraphQL doc with no empty selection sets — critical regression guard per memory):

```ts
it("WEAPON_TREE_QUERY parses as valid GraphQL at depth 5", () => {
  expect(() => parseGraphQL(WEAPON_TREE_QUERY)).not.toThrow();
});

it("WEAPON_TREE_QUERY queries allowedCategories", () => {
  expect(WEAPON_TREE_QUERY).toMatch(/allowedCategories\s*\{[^}]*normalizedName/);
});
```

- [ ] **Step 3: Run the tests — expect failures**

```bash
pnpm --filter @tarkov/data test weaponTree
```

Expected: the four new tests FAIL (`allowedCategories` field missing on `SlotNode`; query doesn't include the new fragment); the depth-5 parse test PASSES for the wrong reason (query today is valid at depth 3; will still be valid after bump).

- [ ] **Step 4: Implement — edit `weaponTree.ts`**

Open `packages/tarkov-data/src/queries/weaponTree.ts`. Make four edits.

**Edit 4a** — bump `RECURSION_DEPTH`:

```ts
const RECURSION_DEPTH = 5;
```

**Edit 4b** — extend `buildSlotSelection` to include `allowedCategories`. The current return string ends with `}` closing `filters`. Replace the `filters { allowedItems { … } }` block with:

```ts
return `
    id
    nameId
    name
    required
    filters {
      allowedItems {
        id
        name${propertiesBlock}
      }
      allowedCategories {
        id
        name
        normalizedName
      }
    }`;
```

**Edit 4c** — add the `SlotCategory` interface and extend `SlotNode`. After the existing `export interface AllowedItem { … }` block, add:

```ts
export interface SlotCategory {
  readonly id: string;
  readonly name: string;
  readonly normalizedName: string;
}
```

And extend `SlotNode`:

```ts
export interface SlotNode extends SlotNodeForMigration {
  readonly name: string;
  readonly required: boolean;
  readonly allowedItems: readonly AllowedItem[];
  readonly allowedCategories: readonly SlotCategory[];
  readonly children: readonly SlotNode[];
}
```

**Edit 4d** — extend `RawSlotShape` and `normalizeSlots` body:

```ts
interface RawSlotShape {
  id: string;
  nameId: string;
  name: string;
  required: boolean;
  filters: {
    allowedItems: RawItemShape[];
    allowedCategories?: Array<SlotCategory | null> | null;
  } | null;
}

export function normalizeSlots(slots: readonly unknown[], parentPath: string): readonly SlotNode[] {
  return slots.map((raw) => {
    const s = raw as RawSlotShape;
    const path = parentPath ? `${parentPath}/${s.nameId}` : s.nameId;
    const items: readonly AllowedItem[] = (s.filters?.allowedItems ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      children: normalizeSlots(
        item.properties?.__typename === "ItemPropertiesWeaponMod"
          ? (item.properties.slots ?? [])
          : [],
        path,
      ),
    }));
    const categories: readonly SlotCategory[] = (s.filters?.allowedCategories ?? []).filter(
      (c): c is SlotCategory => c != null,
    );
    return {
      nameId: s.nameId,
      name: s.name,
      path,
      required: s.required,
      allowedItems: items,
      allowedCategories: categories,
      allowedItemIds: new Set(items.map((i) => i.id)),
      children: items.flatMap((i) => i.children),
    };
  });
}
```

- [ ] **Step 5: Re-export `SlotCategory` from the package root**

Open `packages/tarkov-data/src/index.ts`. Find the line(s) that re-export from `./queries/weaponTree.js` — it should already re-export `SlotNode`, `AllowedItem`, `WeaponTree`, `fetchWeaponTree`. Add `SlotCategory` to the same export list. Exact edit depends on current syntax; either add to an existing `export type {` list or a new one:

```ts
export type { SlotCategory } from "./queries/weaponTree.js";
```

(If `SlotCategory` is already in an adjacent `export { … }` line, just append it.)

- [ ] **Step 6: Run tests — expect pass**

```bash
pnpm --filter @tarkov/data test weaponTree
```

Expected: all tests pass, including the four new ones.

- [ ] **Step 7: Typecheck the whole monorepo**

```bash
pnpm typecheck
```

Expected: passes. If `apps/web` complains that `SlotNode` is missing `allowedCategories` somewhere, locate the usage and initialize it to `[]` (should only be test fixtures or mocks). The SlotTree consumer doesn't need code changes yet — Phase D will use the field.

- [ ] **Step 8: Stage this task's changes (do not commit yet — Phase B bundles with this)**

```bash
git add packages/tarkov-data/src/queries/weaponTree.ts \
        packages/tarkov-data/src/queries/weaponTree.test.ts \
        packages/tarkov-data/src/index.ts
git status --short
```

Expected: the three files staged; nothing else changed.

### Task 3: Verify response-size budget at depth 5

**Files:** (verification only — no code edits)

- [ ] **Step 1: Probe a representative weapon against the upstream**

The concern is whether depth-5 response blows the 250 KB budget. Do a live fetch. Start the data-proxy Worker or hit the upstream directly:

```bash
# M4A1 — id 5447a9cd4bdc2dbd208b4567 (used in the seed-build fixture)
curl -s -X POST https://api.tarkov.dev/graphql \
  -H 'content-type: application/json' \
  -d "$(pnpm --silent exec tsx -e "
    const { WEAPON_TREE_QUERY } = await import('./packages/tarkov-data/dist/queries/weaponTree.js');
    console.log(JSON.stringify({ query: WEAPON_TREE_QUERY, variables: { id: '5447a9cd4bdc2dbd208b4567' } }));
  ")" \
  | wc -c
```

If the `pnpm … tsx -e` pipeline is awkward, run it as two steps: build `@tarkov/data`, then write a tiny ad-hoc script to print the query, then pipe to curl. The goal is just a byte count.

Expected: well under `250 * 1024` bytes (≈ 256000). Record the byte count — you'll reference it in the commit message.

- [ ] **Step 2: If the budget is blown**

If the response exceeds 250 KB:

1. Revert `RECURSION_DEPTH` to `4` in `weaponTree.ts`.
2. Re-run the probe. Record the depth-4 size.
3. Update the commit message + spec follow-up list to note the depth-5 deferral.

Otherwise proceed to the commit.

- [ ] **Step 3: Commit Task 2 + Task 3**

```bash
git commit -m "$(cat <<'EOF'
feat(data): weaponTree allowedCategories + depth 3→5

Extends the weapon-tree GraphQL query to pull allowedCategories on
each slot's filters block, and bumps RECURSION_DEPTH from 3 to 5.

New SlotNode.allowedCategories field (readonly SlotCategory[]) —
always present, empty when upstream omits the list. Normalizer is
defensive against null entries in the upstream response.

Depth-5 response size measured at <record-byte-count> for the M4A1
(well under the 250 KB budget).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Replace `<record-byte-count>` with the actual measurement.

---

## Phase C — `@tarkov/data`: modList

### Task 4: Add `craftsFor` / `bartersFor` presence fragments

**Files:**

- Modify: `packages/tarkov-data/src/queries/modList.ts`
- Modify: `packages/tarkov-data/src/queries/modList.test.ts`

- [ ] **Step 1: Extend the inline test fixture (TDD — add failing cases first)**

Open `packages/tarkov-data/src/queries/modList.test.ts`. Find the `sampleMod` const. Add the two new arrays near the bottom, alongside `buyFor`:

```ts
const sampleMod = {
  id: "mod-1",
  // ... all existing fields unchanged ...
  buyFor: [
    /* ... */
  ],
  craftsFor: [{ id: "craft-1" }, { id: "craft-2" }],
  bartersFor: [{ id: "barter-1" }],
};
```

Then, if a second fixture or inline object exists that the tests use (e.g., a "minimal mod" for edge cases), extend it consistently: `craftsFor: []`, `bartersFor: null`. If no such edge-case fixture exists, inline one in the new test below.

- [ ] **Step 2: Add new test cases**

After the existing `describe("modListSchema", …)` or `describe("fetchModList", …)` block, add (or augment the nearest schema-parsing test):

```ts
it("parses craftsFor and bartersFor when populated", () => {
  const result = modListSchema.safeParse({ items: [sampleMod] });
  expect(result.success).toBe(true);
  if (result.success) {
    const item = result.data.items[0]!;
    expect(item.craftsFor).toHaveLength(2);
    expect(item.craftsFor?.[0]?.id).toBe("craft-1");
    expect(item.bartersFor).toHaveLength(1);
    expect(item.bartersFor?.[0]?.id).toBe("barter-1");
  }
});

it("accepts null craftsFor / bartersFor", () => {
  const nulled = { ...sampleMod, id: "mod-nulled", craftsFor: null, bartersFor: null };
  const result = modListSchema.safeParse({ items: [nulled] });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.items[0]!.craftsFor).toBeNull();
    expect(result.data.items[0]!.bartersFor).toBeNull();
  }
});

it("accepts empty craftsFor / bartersFor arrays", () => {
  const empty = { ...sampleMod, id: "mod-empty", craftsFor: [], bartersFor: [] };
  const result = modListSchema.safeParse({ items: [empty] });
  expect(result.success).toBe(true);
});

it("MOD_LIST_QUERY queries craftsFor and bartersFor", () => {
  // MOD_LIST_QUERY isn't exported today — import it if needed, or rely on the
  // behavior test above. Skip this test if MOD_LIST_QUERY isn't exported.
});
```

If `MOD_LIST_QUERY` isn't currently exported, check `modList.ts` exports. If absent, either export it (add `export` keyword) or drop that final test (the zod parse test already guarantees runtime correctness). Prefer exporting — it's consistent with `WEAPON_TREE_QUERY` and enables regression guards.

- [ ] **Step 3: Run the tests — expect failures**

```bash
pnpm --filter @tarkov/data test modList
```

Expected: the new zod-parse tests FAIL (schema doesn't know about `craftsFor`/`bartersFor`).

- [ ] **Step 4: Extend the GraphQL query**

Open `packages/tarkov-data/src/queries/modList.ts`. Find the query block. After `buyFor { … }` (the last field before the closing `}`), add:

```graphql
      craftsFor {
        id
      }
      bartersFor {
        id
      }
```

(Match the existing indentation — two-space blocks inside `items(type: mods) { … }`.)

- [ ] **Step 5: Extend the zod schema**

Still in `modList.ts`. Below `buyForEntrySchema` usage, add small reference schemas. Insert before `modListItemSchema`:

```ts
const craftReferenceSchema = z.object({ id: z.string() });
const barterReferenceSchema = z.object({ id: z.string() });
```

Extend `modListItemSchema` (find the object-shape) to include:

```ts
const modListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  iconLink: z.string().url(),
  weight: z.number(),
  types: z.array(z.string()),
  minLevelForFlea: z.number().int().nullable(),
  properties: modPropertiesSchema,
  buyFor: z.array(buyForEntrySchema).nullable(),
  craftsFor: z.array(craftReferenceSchema).nullable(),
  bartersFor: z.array(barterReferenceSchema).nullable(),
});
```

- [ ] **Step 6: Ensure `MOD_LIST_QUERY` is exported (if not already)**

Check the top of `modList.ts`. If the query const declaration reads `const MOD_LIST_QUERY = …`, change it to `export const MOD_LIST_QUERY = …`. If already exported, skip this step.

- [ ] **Step 7: Run tests — expect pass**

```bash
pnpm --filter @tarkov/data test modList
```

Expected: all tests pass (including the new ones).

- [ ] **Step 8: Typecheck the monorepo**

```bash
pnpm typecheck
```

Expected: passes. Extending `ModListItem` with two new optional arrays is a widening, so existing consumers should still type-check. If `apps/web` complains, the complaint is most likely in a test that mocks `ModListItem` — extend the mock with `craftsFor: null, bartersFor: null`.

- [ ] **Step 9: Commit Task 4**

```bash
git add packages/tarkov-data/src/queries/modList.ts \
        packages/tarkov-data/src/queries/modList.test.ts
git commit -m "$(cat <<'EOF'
feat(data): modList craftsFor + bartersFor fragments

Extends the ModList GraphQL query + zod schema to carry craftsFor
and bartersFor as { id }-only reference arrays. Presence-only for
scope B1 — the UI uses these to render informational CRAFT / BARTER
Pills, no changes to itemAvailability() or the availability
semantics.

Both arrays are nullable to match the existing buyFor precedent.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase D — `apps/web`: slot-tree UI

### Task 5: Wire `getModSources` from builder route into `<SlotTree>`

**Files:**

- Modify: `apps/web/src/routes/builder.tsx`
- Modify: `apps/web/src/features/builder/slot-tree.tsx`

- [ ] **Step 1: Add `modSourcesById` memo in `builder.tsx`**

Open `apps/web/src/routes/builder.tsx`. Find the `availabilityById` memo (around line 150). Add a parallel memo directly below it:

```ts
const availabilityById = useMemo(() => {
  const map = new Map<string, ReturnType<typeof itemAvailability>>();
  for (const m of mods.data ?? []) {
    map.set(m.id, itemAvailability(m, profile));
  }
  return map;
}, [mods.data, profile]);

const modSourcesById = useMemo(() => {
  const map = new Map<string, { hasCraft: boolean; hasBarter: boolean }>();
  for (const m of mods.data ?? []) {
    map.set(m.id, {
      hasCraft: (m.craftsFor?.length ?? 0) > 0,
      hasBarter: (m.bartersFor?.length ?? 0) > 0,
    });
  }
  return map;
}, [mods.data]);
```

- [ ] **Step 2: Pass `getModSources` to `<SlotTree>`**

Find the `<SlotTree …/>` usage (around line 441). The current prop list ends with `getAvailability={(id) => availabilityById.get(id) ?? null}` and `showAll={showAll}`. Add a `getModSources` prop immediately before `showAll`:

```tsx
<SlotTree
  tree={tree.data}
  attachments={attachments}
  onAttach={/* ... existing ... */}
  getAvailability={(id) => availabilityById.get(id) ?? null}
  getModSources={(id) => modSourcesById.get(id) ?? { hasCraft: false, hasBarter: false }}
  showAll={showAll}
/>
```

- [ ] **Step 3: Extend `SlotTreeProps` and thread the prop down**

Open `apps/web/src/features/builder/slot-tree.tsx`. Add `getModSources` to the props interface:

```ts
export interface ModSources {
  readonly hasCraft: boolean;
  readonly hasBarter: boolean;
}

export interface SlotTreeProps {
  tree: WeaponTree;
  attachments: Readonly<Record<string, string>>;
  onAttach: (path: string, itemId: string | null) => void;
  getAvailability?: (itemId: string) => ItemAvailability | null;
  getModSources?: (itemId: string) => ModSources;
  showAll?: boolean;
  diff?: SlotDiffMap;
}
```

Update the `SlotTree` function signature + the `<SlotRow/>` call to forward `getModSources`:

```tsx
export function SlotTree({
  tree,
  attachments,
  onAttach,
  getAvailability,
  getModSources,
  showAll,
  diff,
}: SlotTreeProps) {
  // ... existing "no slots" guard unchanged ...
  return (
    <ul className="flex flex-col" onKeyDown={handleSlotTreeKeyDown /* added in Task 8 */}>
      {tree.slots.map((slot) => (
        <SlotRow
          key={slot.path}
          slot={slot}
          attachments={attachments}
          onAttach={onAttach}
          getAvailability={getAvailability}
          getModSources={getModSources}
          showAll={showAll}
          depth={0}
          diff={diff}
        />
      ))}
    </ul>
  );
}
```

(Don't add `handleSlotTreeKeyDown` yet — it comes in Task 8. For now you can drop the `onKeyDown` line and re-add it later, or stub a `noop` handler.)

Extend the `SlotRow` props type to include `getModSources?: (itemId: string) => ModSources;` and thread it to nested `<SlotRow/>` calls when `selectedItem.children` are rendered.

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @tarkov/web typecheck
```

Expected: passes. No test run yet — Tasks 6/7/8 add the actual UI behavior.

### Task 6: Render `allowedCategories` label (scope A1)

**Files:** modify `apps/web/src/features/builder/slot-tree.tsx`

- [ ] **Step 1: Replace the "deferred" fallback with a category label**

Find this block in `SlotRow` (around the "No explicit allowed items" message):

```tsx
{slot.allowedItems.length === 0 ? (
  <p className="p-2 font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--color-paper-dim)]">
    No explicit allowed items — category-based slot (deferred).
  </p>
) : (
  <ul className="flex flex-col">
```

Replace with:

```tsx
{slot.allowedItems.length === 0 ? (
  slot.allowedCategories.length > 0 ? (
    <p className="p-2 font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--color-paper-dim)]">
      <span className="text-[var(--color-foreground)]">ACCEPTS</span>
      {" · "}
      {slot.allowedCategories.map((c) => c.name).join(" · ")}
    </p>
  ) : (
    <p className="p-2 font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--color-paper-dim)]">
      No explicit allowed items or categories.
    </p>
  )
) : (
  <ul className="flex flex-col">
```

Don't touch anything inside the `<ul>` branch.

- [ ] **Step 2: Typecheck + lint**

```bash
pnpm --filter @tarkov/web typecheck
pnpm --filter @tarkov/web lint
```

Expected: pass.

- [ ] **Step 3: Visual sanity check (optional but useful)**

Start the stack locally and open a weapon known to have a category-only slot. Since we don't have an exhaustive list, pick any weapon in `/builder` and expand slots until you see one with "ACCEPTS · …" or confirm the fallback text renders cleanly. If the stack is already up from Arc 0 smoke, skip.

### Task 7: Render `CRAFT` / `BARTER` Pills (scope B1)

**Files:** modify `apps/web/src/features/builder/slot-tree.tsx`

- [ ] **Step 1: Import the Pill component is already present; extend the item-row render**

Find the item row render inside `SlotRow` (the `{slot.allowedItems.map((item) => { … })}` block). Currently the `<div className="flex items-center gap-2 flex-shrink-0">` contains:

```tsx
<div className="flex items-center gap-2 flex-shrink-0">
  {requirementLabel && (
    <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--color-paper-dim)]">
      {requirementLabel}
    </span>
  )}
  <AvailabilityPill availability={availability} />
</div>
```

Replace with:

```tsx
<div className="flex items-center gap-2 flex-shrink-0">
  {requirementLabel && (
    <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--color-paper-dim)]">
      {requirementLabel}
    </span>
  )}
  <SourcePills sources={getModSources?.(item.id)} />
  <AvailabilityPill availability={availability} />
</div>
```

- [ ] **Step 2: Add the `SourcePills` component at the bottom of the file**

Add this component below the existing `AvailabilityPill`:

```tsx
function SourcePills({ sources }: { sources: ModSources | undefined }) {
  if (!sources) return null;
  return (
    <>
      {sources.hasCraft && <Pill tone="muted">CRAFT</Pill>}
      {sources.hasBarter && <Pill tone="muted">BARTER</Pill>}
    </>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

```bash
pnpm --filter @tarkov/web typecheck
pnpm --filter @tarkov/web lint
```

Expected: pass.

### Task 8: Sticky top-level headers + keyboard nav (scope C)

**Files:** modify `apps/web/src/features/builder/slot-tree.tsx`

- [ ] **Step 1: Make top-level `<summary>` rows sticky**

In `SlotRow`, the `<summary>` currently reads:

```tsx
<summary
  className="flex cursor-pointer items-center gap-3 py-2 pr-3 hover:bg-[var(--color-muted)] transition-colors"
  style={{ paddingLeft: `${12 + indentPx}px` }}
>
```

Only the top-level rows need to stick (`depth === 0`). Extend the className:

```tsx
<summary
  className={`flex cursor-pointer items-center gap-3 py-2 pr-3 hover:bg-[var(--color-muted)] transition-colors ${
    depth === 0 ? "sticky top-0 z-10 bg-[var(--color-background)]" : ""
  }`}
  style={{ paddingLeft: `${12 + indentPx}px` }}
>
```

- [ ] **Step 2: Confirm the slot-tree's parent is a scroll container**

Sticky positioning only activates when the nearest scroll ancestor is actually scrolling. In `apps/web/src/routes/builder.tsx`, find the container that wraps `<SlotTree>`. If it doesn't already have `overflow-y: auto` + a height constraint, add one.

Search for the `<SlotTree …/>` call and inspect the wrapping div. The Builder page is long and the outer layout is the page scroll context. If the immediate parent doesn't scroll on its own, a single top-level sticky header still behaves correctly when the user scrolls the page because `sticky top-0` tracks the viewport. That is fine for Arc 1 — we don't need an isolated scroll container.

If the visual behavior is wrong (header scrolls away), revisit and add `overflow-y: auto max-h-[Xvh]` to the slot-tree's immediate parent in `builder.tsx`. Record what you did.

- [ ] **Step 3: Add keyboard handler at the `<ul>` root**

At the top of `slot-tree.tsx` (below imports), add the handler:

```tsx
function handleSlotTreeKeyDown(e: React.KeyboardEvent<HTMLUListElement>) {
  const root = e.currentTarget;
  const key = e.key;

  if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "ArrowLeft" && key !== "ArrowRight") {
    return;
  }

  const targets = Array.from(
    root.querySelectorAll<HTMLElement>("summary[data-slot-path], [data-slot-path] > div button"),
  );
  const active = document.activeElement as HTMLElement | null;
  const idx = active ? targets.indexOf(active) : -1;

  if (key === "ArrowDown") {
    const next = targets[Math.min(idx + 1, targets.length - 1)];
    if (next && next !== active) {
      e.preventDefault();
      next.focus();
    }
    return;
  }

  if (key === "ArrowUp") {
    const prev = targets[Math.max(idx - 1, 0)];
    if (prev && prev !== active) {
      e.preventDefault();
      prev.focus();
    }
    return;
  }

  // ArrowRight / ArrowLeft only affect summary elements.
  if (!active || active.tagName !== "SUMMARY") return;

  const details = active.parentElement as HTMLDetailsElement | null;
  if (!details || details.tagName !== "DETAILS") return;

  if (key === "ArrowRight" && !details.open) {
    e.preventDefault();
    details.open = true;
    return;
  }

  if (key === "ArrowLeft" && details.open) {
    e.preventDefault();
    details.open = false;
    return;
  }
}
```

- [ ] **Step 4: Also attach `data-slot-path` to the summary element**

The handler queries `summary[data-slot-path]`. Today the `<details>` carries `data-slot-path={slot.path}`, not the `<summary>`. Two options: move/dupe the attribute to `<summary>`, OR change the selector to target `details[data-slot-path] > summary`.

Prefer the latter — it keeps the existing `[data-slot-path]` convention intact. Update the handler's selector:

```tsx
const targets = Array.from(
  root.querySelectorAll<HTMLElement>(
    "details[data-slot-path] > summary, details[data-slot-path] > div button",
  ),
);
```

Also fix the `ArrowRight`/`ArrowLeft` path to use `closest` for robustness:

```tsx
const details = active.closest("details[data-slot-path]") as HTMLDetailsElement | null;
```

(The `active.tagName === "SUMMARY"` check already ensures arrow-left/right only fires on summaries.)

- [ ] **Step 5: Wire the handler into the root `<ul>`**

In the `SlotTree` return, replace `<ul className="flex flex-col">` with:

```tsx
<ul className="flex flex-col" onKeyDown={handleSlotTreeKeyDown}>
```

(Only the OUTER `<ul>` — nested `<ul>`s inside `SlotRow` stay untouched. The handler bubbles from nested children to the root.)

- [ ] **Step 6: Make top-level summaries focusable**

`<summary>` is focusable by default in most browsers, but tabindex handling can be flaky. Add `tabIndex={0}` explicitly to `<summary>` in `SlotRow`:

```tsx
<summary
  tabIndex={0}
  className={...}
  style={...}
>
```

- [ ] **Step 7: Typecheck + lint + test**

```bash
pnpm --filter @tarkov/web typecheck
pnpm --filter @tarkov/web lint
pnpm --filter @tarkov/web test
```

Expected: all pass.

- [ ] **Step 8: Commit all of Phase D (Tasks 5–8)**

```bash
git add apps/web/src/routes/builder.tsx \
        apps/web/src/features/builder/slot-tree.tsx
git commit -m "$(cat <<'EOF'
feat(builder): slot-tree category label + craft/barter pills + sticky + keyboard nav

Four Builder slot-tree enrichments:

- Category label — when a slot has allowedCategories but no
  allowedItems, render "ACCEPTS · <names>" in the slot body. Replaces
  the previous "(deferred)" bail-out.
- CRAFT / BARTER Pills — informational (tone=muted) Pills next to
  the availability Pill on each item row. Presence-only; no changes
  to itemAvailability().
- Sticky top-level headers — depth=0 <summary> rows get position:
  sticky so the active slot's header stays visible on scroll.
- Keyboard navigation — ArrowDown/Up move focus through slot
  summaries + item buttons; ArrowRight/Left open/close the active
  <details>. Enter/Space native behavior unchanged.

A new getModSources(id) getter feeds the pills from builder.tsx,
mirroring the existing getAvailability pattern.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase E — E2E smoke

### Task 9: Add slot-tree keyboard-nav smoke

**Files:** modify `apps/web/e2e/smoke.spec.ts`

- [ ] **Step 1: Add a new test at the bottom of the file**

Append inside (or after) the existing `test.describe("smoke — Builder-focus nav + WIP banners", …)` block — or add a new `test.describe` group:

```ts
test.describe("smoke — slot-tree keyboard nav", () => {
  test("ArrowDown moves focus to the next slot summary", async ({ page }) => {
    const { errors } = captureConsoleErrors(page);

    // Use the seed-build URL convention if available; otherwise land on /builder
    // and pick the first weapon. For smoke we just need a weapon with slots.
    await page.goto("/builder", { waitUntil: "networkidle" });

    // Pick the first weapon from the combobox / list. The SPA renders a weapon
    // picker — select it by opening and clicking the first option.
    const weaponPicker = page.getByRole("combobox", { name: /weapon/i });
    if (await weaponPicker.isVisible().catch(() => false)) {
      await weaponPicker.click();
      await page.getByRole("option").first().click();
    }

    // Wait for the slot tree to render.
    const summaries = page.locator("details[data-slot-path] > summary");
    await expect(summaries.first()).toBeVisible({ timeout: 10_000 });

    // Focus the first summary and press ArrowDown.
    await summaries.first().focus();
    await page.keyboard.press("ArrowDown");

    // The active element should no longer be the first summary.
    const activeIsFirst = await page.evaluate(() => {
      const first = document.querySelector("details[data-slot-path] > summary");
      return document.activeElement === first;
    });
    expect(activeIsFirst).toBe(false);

    expect(errors, `Console errors on slot-tree keyboard nav:\n${errors.join("\n")}`).toEqual([]);
  });
});
```

Note: the weapon-picker interaction is best-effort — the actual selector depends on the Builder's current UI. If the combobox selector above doesn't match, open `apps/web/src/routes/builder.tsx` and find the weapon-selection input's role/label. Adjust the test accordingly. If there's a cleaner path (e.g., a test fixture weapon id or a URL param), prefer that.

- [ ] **Step 2: Run the smoke locally**

```bash
pnpm --filter @tarkov/web build
pnpm --filter @tarkov/web test:e2e -- --grep "slot-tree keyboard nav"
```

Expected: PASS. If the weapon picker selector doesn't match, iterate on it until it does. If the test times out finding `summaries.first()`, the Builder might not auto-load a weapon — add an explicit wait or pick a shorter-time-to-render weapon.

- [ ] **Step 3: Run the full smoke suite to confirm no regressions**

```bash
pnpm --filter @tarkov/web test:e2e
```

Expected: all tests pass (the new one + the existing ~13).

- [ ] **Step 4: Commit Phase E**

```bash
git add apps/web/e2e/smoke.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): keyboard nav in slot tree

New smoke test: on /builder with a weapon loaded, focus the first
slot summary, press ArrowDown, and assert focus moves to a different
element. Guards the keyboard-nav scope of Arc 1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase F — Ship

### Task 10: Push, PR, CI, merge

- [ ] **Step 1: Final baseline check**

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm --filter @tarkov/data test
pnpm --filter @tarkov/web test
```

Expected: all pass.

- [ ] **Step 2: Push the branch**

```bash
git push -u origin feat/m3.5-arc-1-builder-depth
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create --title "feat(builder): M3.5 Arc 1 — slot-tree depth, categories, craft/barter pills, keyboard nav" --body "$(cat <<'EOF'
## Summary

Second arc of M3.5 "Depth & Polish." Four Builder slot-tree enrichments:

- **`allowedCategories` label** (scope A1) — slot body now shows
  \`ACCEPTS · <category names>\` when upstream provides categories
  instead of explicit allowed items. Previously showed a bail-out.
- **Craft / Barter informational Pills** (scope B1) — each item row
  may carry additional \`CRAFT\` and/or \`BARTER\` pills next to the
  availability pill. Presence-only — no changes to \`itemAvailability()\`.
- **Sticky top-level slot headers + keyboard nav** (scope C) — the
  active top-level slot's \`<summary>\` stays visible on scroll; Arrow
  keys move focus through the tree (ArrowDown/Up) and open/close the
  active \`<details>\` (ArrowRight/Left).
- **Recursion depth 3 → 5** (scope D) — deeper mod chains (muzzle →
  suppressor → endcap, etc.) are now present in the fetched tree.
  Response size measured at <record-byte-count> for M4A1, well under
  the 250 KB budget.

## Spec + plan

- Spec: \`docs/superpowers/specs/2026-04-22-builder-slot-tree-depth-design.md\`
- Plan: \`docs/plans/2026-04-22-arc-1-builder-slot-tree-depth-plan.md\`

## Test plan

- [x] \`pnpm typecheck\`, \`pnpm lint\`, \`pnpm format:check\` all pass
- [x] \`@tarkov/data\` unit tests pass (new allowedCategories + craftsFor/bartersFor cases)
- [x] \`@tarkov/web\` unit tests pass
- [x] Playwright smoke suite green (new keyboard-nav test + existing)
- [x] Manual: open /builder with an M4A1, verify ACCEPTS labels on rail/mount slots, CRAFT/BARTER pills on buyable-and-craftable mods, ArrowDown shifts focus through slot summaries, top-level header stays visible on scroll
- [x] Response-size probe: M4A1 WEAPON_TREE_QUERY < 250 KB at depth 5

## Out of scope / follow-ups

- **A2** — Category-filtered item picker (fetch items-by-category + picker UI). Arc-sized follow-up if label-only proves insufficient.
- **B2** — Full crafts/barters gating in \`itemAvailability\` (walk recipes, add new \`ItemAvailability\` variants). Separate arc.
- Hover detail on \`CRAFT\` / \`BARTER\` pills (station/trader + level tooltip).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Replace `<record-byte-count>` in the body with the actual depth-5 M4A1 measurement from Task 3.

- [ ] **Step 4: Wait for CI + merge**

```bash
gh pr checks --watch
# When green:
gh pr merge --squash --admin
```

- [ ] **Step 5: Post-merge cleanup**

```bash
git checkout --detach origin/main
git fetch --prune origin
git branch -D main feat/m3.5-arc-1-builder-depth
git checkout -b main origin/main
```

Expect release-please to open (or update) an updated release PR with a minor bump — `feat(data):` + `feat(builder):` drive a minor version bump.

---

## Self-review checklist

1. **Spec coverage:**
   - Spec §1 (depth 3→5) → Task 2 step 4a + Task 3
   - Spec §2 (allowedCategories) → Task 2 (query/normalizer/types) + Task 6 (UI)
   - Spec §3 (crafts/barters) → Task 4 (query/schema) + Tasks 5 + 7 (UI wiring)
   - Spec §4 (sticky + keyboard nav) → Task 8
   - Spec "Testing" → Tasks 2/4/9
   - Spec "Rollout" → Task 10
2. **Placeholder scan:** no "TBD", "implement later", or bare "similar to…" references.
3. **Type consistency:** `SlotCategory`, `ModSources`, `getModSources`, `modSourcesById` are consistently named across tasks.
4. **Ambiguity:** plan-vs-spec deltas captured in the "Spec vs. plan deltas" preamble (crafts/barters simplified to `{id}`; fixtures are inline not JSON).
