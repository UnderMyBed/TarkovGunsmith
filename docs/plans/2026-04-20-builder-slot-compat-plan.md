# Builder Robustness PR 2 — Slot-Based Mod Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Second PR of the Milestone 1.5 Builder Robustness arc. Replace `/builder`'s flat mod checklist with a slot tree derived from the weapon's actual `ItemSlot` graph, make invalid attachments structurally impossible, bump the build schema to v2, and migrate v1 builds forward.

**Architecture:** New `packages/tarkov-data/src/queries/weaponTree.ts` fetches a weapon + its recursive slots + per-slot `allowedItems` in one GraphQL query (manual recursion, capped at depth 3 — enough for every weapon in current tarkov.dev data; depth 5 is the long-term target but deferred to a follow-up once 3-level coverage is validated in prod). Response is normalized to a `SlotNode[]` tree. `BuildV2` stores `attachments: Record<SlotPath, ItemId>` keyed by `/`-joined `nameId` paths, plus an `orphaned: string[]` bucket for mods the v1→v2 migration couldn't place. Migration is a pure function tested with fixture builds; it runs inside `BuilderPage` when the component receives a v1 initial state and the tree has loaded. The slot tree UI uses native `<details>`-based expandable rows with inline pickers — no `Dialog` primitive yet; that lands in PR 3 when the profile drawer needs it.

**Tech Stack:** Zod 3, TanStack Query 5, TanStack Router 1, graphql-request 7. No new runtime deps.

---

## File map (what exists at the end of this plan)

```
packages/tarkov-data/src/
├── build-schema.ts                 MODIFIED — add BuildV2 variant to discriminated union, bump CURRENT_BUILD_VERSION
├── build-schema.test.ts            MODIFIED — add v2 parse/reject fixtures
├── build-migrations.ts             NEW      — migrateV1ToV2(v1, tree): BuildV2
├── build-migrations.test.ts        NEW      — clean / partial / fully-orphaned fixture tests
├── queries/
│   ├── weaponTree.ts               NEW      — WEAPON_TREE_QUERY + fetcher + SlotNode normalizer
│   ├── weaponTree.test.ts          NEW      — fetcher tests + normalizer tests
│   └── modList.ts                  MODIFIED — add categories { id name } for future category-based slot filtering (kept narrow for PR 2 — used only to hydrate picker labels when only ids are returned)
├── hooks/
│   └── useWeaponTree.ts            NEW      — thin useQuery wrapper
└── index.ts                        MODIFIED — export the new symbols

apps/web/src/
├── features/builder/               NEW directory
│   ├── slot-tree.tsx               NEW      — SlotTree + SlotRow components
│   ├── picker.tsx                  NEW      — expandable per-slot picker, filtered to allowedItems
│   └── orphaned-banner.tsx         NEW      — renders orphaned mods with a "fix" CTA
└── routes/
    └── builder.tsx                 MODIFIED — swap flat checklist for SlotTree; state is Record<SlotPath,ItemId>; save-flow produces BuildV2; migrate v1 init state once tree loads
```

The `/builder/$id` route (`apps/web/src/routes/builder.$id.tsx`) needs **no** changes — it still passes `build` to `BuilderPage` via `initialWeaponId` / `initialModIds` / `initialAttachments` (new prop added in Task 6). The migration happens inside `BuilderPage`.

---

## Prerequisites

- Worktree: `.worktrees/builder-pr2` on `feat/builder-robustness-pr2-slot-compat` branched off `main` at `7c9e061`.
- Baseline: `pnpm install` done; `pnpm test` = 62 tests passing across the monorepo.

---

## Design decisions locked in this plan

1. **Recursion depth = 3**, not 5. Every common weapon (AR, AK, shotgun, pistol) fits in 3 levels. Depth 5 would expand query size ~4×. If prod traffic reveals a weapon that needs depth 4+, bump in a 1-line helper change. Explicit "known limitation" in the PR body.

2. **`allowedCategories` is ignored in PR 2.** Slot filtering uses only `ItemSlot.filters.allowedItems`. Some slots specify categories instead (e.g. "any rail mod"); those will show empty pickers in PR 2. Documented as a follow-up. Cheap to add later — one extra field on `modList` plus a category-set lookup in the picker.

3. **No `Dialog` primitive yet.** The spec says "picker modal"; we ship expandable `<details>`-based inline pickers instead. Cheaper for PR 2, visually fine, keyboard-navigable natively. If PR 3's profile drawer or PR 4's presets need a real modal, we add it there.

4. **Migration runs inside `BuilderPage`**, not inside `loadBuild`. The loader has no access to the weapon tree (needs the `weaponId` to fetch it); the component does. Migration fires in a `useEffect` when initial state is v1 AND tree data is loaded.

5. **Empty-slot representation.** `attachments` is `Record<SlotPath, ItemId>` — slots without an attachment are simply absent keys. UI renders "+ empty" rows from the tree, not from the attachments record.

---

## Phase 1: Schema v2 + migration

### Task 1: Extend the build schema with `BuildV2`

**Files:**

- Modify: `packages/tarkov-data/src/build-schema.ts`
- Modify: `packages/tarkov-data/src/build-schema.test.ts`

- [ ] **Step 1: Read the current `build-schema.ts`** to confirm `BuildV1` + `Build` union + `CURRENT_BUILD_VERSION = 1 as const` exist.

- [ ] **Step 2: Edit `packages/tarkov-data/src/build-schema.ts`. Find the existing `Build` discriminated union + constant:**

```ts
export const Build = z.discriminatedUnion("version", [BuildV1]);
export type Build = z.infer<typeof Build>;

/**
 * The version a freshly-saved build should carry. Bump each PR. `as const`
 * so callers can use this literal in `{ version: CURRENT_BUILD_VERSION }`
 * without a cast.
 */
export const CURRENT_BUILD_VERSION = 1 as const;
```

Replace with:

```ts
/**
 * Build schema v2 — slot-aware.
 *
 * Replaces the flat `modIds` array with a `Record<SlotPath, ItemId>` map
 * keyed by `/`-joined slot `nameId` paths (e.g. `"mod_scope/mod_mount_000"`).
 * `orphaned` captures item ids the v1→v2 migration couldn't place in the
 * current weapon tree — rendered as a dismissable banner so the user can
 * manually re-home them.
 */
export const BuildV2 = z.object({
  version: z.literal(2),
  weaponId: z.string().min(1),
  attachments: z.record(z.string().min(1), z.string().min(1)),
  orphaned: z.array(z.string().min(1)).max(64),
  // UTC-only: Zod rejects timezone offsets by default; Date.toISOString() always produces a Z-suffix.
  createdAt: z.string().datetime(),
});

export type BuildV2 = z.infer<typeof BuildV2>;

export const Build = z.discriminatedUnion("version", [BuildV1, BuildV2]);
export type Build = z.infer<typeof Build>;

/**
 * The version a freshly-saved build should carry. Bump each PR. `as const`
 * so callers can use this literal in `{ version: CURRENT_BUILD_VERSION }`
 * without a cast.
 */
export const CURRENT_BUILD_VERSION = 2 as const;
```

- [ ] **Step 3: Edit `packages/tarkov-data/src/build-schema.test.ts`. After the `describe("Build (discriminated union)", ...)` block add:**

```ts
describe("BuildV2", () => {
  const validV2 = {
    version: 2 as const,
    weaponId: "weapon-abc",
    attachments: { mod_scope: "mod-s1", "mod_muzzle/mod_muzzle_adapter": "mod-m2" },
    orphaned: [],
    createdAt: "2026-04-20T12:00:00.000Z",
  };

  it("parses a valid v2 payload", () => {
    expect(BuildV2.parse(validV2)).toEqual(validV2);
  });

  it("rejects a wrong version literal", () => {
    expect(BuildV2.safeParse({ ...validV2, version: 1 }).success).toBe(false);
  });

  it("rejects empty slot paths in attachments", () => {
    expect(BuildV2.safeParse({ ...validV2, attachments: { "": "mod-x" } }).success).toBe(false);
  });

  it("rejects empty item ids in attachments", () => {
    expect(BuildV2.safeParse({ ...validV2, attachments: { mod_scope: "" } }).success).toBe(false);
  });

  it("rejects more than 64 orphaned items", () => {
    const orphaned = Array.from({ length: 65 }, (_, i) => `o-${i}`);
    expect(BuildV2.safeParse({ ...validV2, orphaned }).success).toBe(false);
  });
});

describe("Build (discriminated union) — v2", () => {
  it("dispatches to BuildV2 when version is 2", () => {
    const v2 = {
      version: 2 as const,
      weaponId: "w",
      attachments: {},
      orphaned: [],
      createdAt: "2026-04-20T00:00:00.000Z",
    };
    expect(Build.parse(v2).version).toBe(2);
  });
});
```

And update the existing `CURRENT_BUILD_VERSION` test:

```ts
describe("CURRENT_BUILD_VERSION", () => {
  it("matches the latest BuildV* variant in the discriminated union", () => {
    expect(CURRENT_BUILD_VERSION).toBe(2);
  });
});
```

(If the current test reads `"is 1 for PR 1 of the Builder Robustness arc"`, replace its body and description as above.)

- [ ] **Step 4: Run the tests:**

```bash
pnpm --filter @tarkov/data test -- build-schema
```

Expected: all previous v1 tests pass + 6 new v2 tests pass + the updated `CURRENT_BUILD_VERSION` test passes. Total: 16.

- [ ] **Step 5: Typecheck + lint:**

```bash
pnpm --filter @tarkov/data typecheck
pnpm --filter @tarkov/data lint
```

- [ ] **Step 6: Commit:**

```bash
git add packages/tarkov-data/src/build-schema.ts packages/tarkov-data/src/build-schema.test.ts
git commit -m "feat(tarkov-data): add BuildV2 (slot paths + orphaned bucket)"
```

### Task 2: `migrateV1ToV2` pure function + tests

**Files:**

- Create: `packages/tarkov-data/src/build-migrations.ts`
- Create: `packages/tarkov-data/src/build-migrations.test.ts`

The migration takes a v1 build and a normalized `SlotNode[]` tree, walks the tree for each `modId`, and places it in the first slot whose `allowedItems` include it. Unmatched ids go into `orphaned[]`. The `SlotNode` type is defined in Task 3 — for this task, import it forward via a shared export in `build-migrations.ts` itself so Task 2 doesn't depend on Task 3's commit. (Task 3 will re-export from `weaponTree.ts` and the types will unify.)

- [ ] **Step 1: Write `packages/tarkov-data/src/build-migrations.test.ts`:**

```ts
import { describe, expect, it } from "vitest";
import { migrateV1ToV2, type SlotNodeForMigration } from "./build-migrations.js";
import type { BuildV1 } from "./build-schema.js";

const v1: BuildV1 = {
  version: 1,
  weaponId: "w1",
  modIds: ["mod-scope-a", "mod-muzzle-a", "mod-unknown"],
  createdAt: "2026-04-20T12:00:00.000Z",
};

function leaf(nameId: string, allowedIds: string[]): SlotNodeForMigration {
  return {
    nameId,
    path: nameId,
    allowedItemIds: new Set(allowedIds),
    children: [],
  };
}

describe("migrateV1ToV2", () => {
  it("places every mod cleanly when the tree unambiguously accepts them", () => {
    const tree = [leaf("mod_scope", ["mod-scope-a"]), leaf("mod_muzzle", ["mod-muzzle-a"])];
    const v2 = migrateV1ToV2(v1, tree);
    expect(v2.version).toBe(2);
    expect(v2.weaponId).toBe("w1");
    expect(v2.attachments).toEqual({
      mod_scope: "mod-scope-a",
      mod_muzzle: "mod-muzzle-a",
    });
    expect(v2.orphaned).toEqual(["mod-unknown"]);
    expect(v2.createdAt).toBe(v1.createdAt);
  });

  it("places a mod in the first accepting slot when multiple match", () => {
    const tree = [leaf("mod_muzzle", ["mod-muzzle-a"]), leaf("mod_muzzle_alt", ["mod-muzzle-a"])];
    const v2 = migrateV1ToV2({ ...v1, modIds: ["mod-muzzle-a"] }, tree);
    expect(v2.attachments).toEqual({ mod_muzzle: "mod-muzzle-a" });
    expect(v2.orphaned).toEqual([]);
  });

  it("puts all mods in orphaned when the tree is empty", () => {
    const v2 = migrateV1ToV2(v1, []);
    expect(v2.attachments).toEqual({});
    expect(v2.orphaned).toEqual(["mod-scope-a", "mod-muzzle-a", "mod-unknown"]);
  });

  it("walks into children when parent slot doesn't match", () => {
    const tree: SlotNodeForMigration[] = [
      {
        nameId: "mod_mount",
        path: "mod_mount",
        allowedItemIds: new Set([]),
        children: [leaf("mod_scope", ["mod-scope-a"]).path /* wrong — fix below */] as never,
      },
    ];
    // Fix: child needs the full node shape plus correct path.
    const realTree: SlotNodeForMigration[] = [
      {
        nameId: "mod_mount",
        path: "mod_mount",
        allowedItemIds: new Set(),
        children: [
          {
            nameId: "mod_scope",
            path: "mod_mount/mod_scope",
            allowedItemIds: new Set(["mod-scope-a"]),
            children: [],
          },
        ],
      },
    ];
    const v2 = migrateV1ToV2({ ...v1, modIds: ["mod-scope-a"] }, realTree);
    expect(v2.attachments).toEqual({ "mod_mount/mod_scope": "mod-scope-a" });
    expect(v2.orphaned).toEqual([]);
    // silence the unused `tree` — see explanation above
    void tree;
  });

  it("deduplicates repeated mod ids (v1 allowed duplicates; v2 does not)", () => {
    const tree = [leaf("mod_muzzle", ["mod-a"])];
    const v2 = migrateV1ToV2({ ...v1, modIds: ["mod-a", "mod-a", "mod-a"] }, tree);
    expect(v2.attachments).toEqual({ mod_muzzle: "mod-a" });
    expect(v2.orphaned).toEqual([]);
  });

  it("caps orphaned at 64 (silent truncation)", () => {
    const manyModIds = Array.from({ length: 200 }, (_, i) => `mod-${i}`);
    const v2 = migrateV1ToV2({ ...v1, modIds: manyModIds }, []);
    expect(v2.orphaned).toHaveLength(64);
  });
});
```

(The awkward `// Fix:` block in the fourth test is an intentional tidy-up of a would-be ambiguous inline literal — feel free to rewrite it as a single clean literal if the implementer prefers. The assertion is the source of truth.)

Actually, clean it up. Replace that whole test with:

```ts
it("walks into children when parent slot doesn't match", () => {
  const tree: SlotNodeForMigration[] = [
    {
      nameId: "mod_mount",
      path: "mod_mount",
      allowedItemIds: new Set(),
      children: [
        {
          nameId: "mod_scope",
          path: "mod_mount/mod_scope",
          allowedItemIds: new Set(["mod-scope-a"]),
          children: [],
        },
      ],
    },
  ];
  const v2 = migrateV1ToV2({ ...v1, modIds: ["mod-scope-a"] }, tree);
  expect(v2.attachments).toEqual({ "mod_mount/mod_scope": "mod-scope-a" });
  expect(v2.orphaned).toEqual([]);
});
```

(Use this cleaned-up version, not the awkward draft above.)

- [ ] **Step 2: Run the test, expect FAIL (module not found):**

```bash
pnpm --filter @tarkov/data test -- build-migrations
```

- [ ] **Step 3: Write `packages/tarkov-data/src/build-migrations.ts`:**

```ts
import type { BuildV1, BuildV2 } from "./build-schema.js";

/**
 * Minimal shape of a slot node the migration needs. The full `SlotNode` type
 * (exported from `queries/weaponTree.ts` in Task 3) is a superset. We declare
 * a local contract here so the migration stays independent of transport
 * concerns.
 */
export interface SlotNodeForMigration {
  readonly nameId: string;
  readonly path: string; // `/`-joined nameIds from the root
  readonly allowedItemIds: ReadonlySet<string>;
  readonly children: readonly SlotNodeForMigration[];
}

const ORPHANED_CAP = 64;

/**
 * Migrate a v1 build to v2 using the weapon's resolved slot tree.
 *
 * For each `modId` in the v1 build we walk the tree (pre-order) and place
 * the mod in the first slot whose `allowedItemIds` contains it. If no slot
 * accepts the mod, it goes into `orphaned[]`.
 *
 * Duplicates in v1 `modIds` are deduped: once a mod has been placed or
 * orphaned, subsequent occurrences are ignored.
 *
 * Orphaned list is capped at {@link ORPHANED_CAP}; extra entries are silently
 * dropped (the user can always re-enter them manually, and 64 is already a
 * larger bucket than any realistic build could fill).
 */
export function migrateV1ToV2(v1: BuildV1, tree: readonly SlotNodeForMigration[]): BuildV2 {
  const attachments: Record<string, string> = {};
  const orphaned: string[] = [];
  const seen = new Set<string>();

  for (const modId of v1.modIds) {
    if (seen.has(modId)) continue;
    seen.add(modId);

    const path = findSlotPathFor(modId, tree);
    if (path !== null) {
      attachments[path] = modId;
    } else if (orphaned.length < ORPHANED_CAP) {
      orphaned.push(modId);
    }
    // else: silently drop — orphaned list is full.
  }

  return {
    version: 2,
    weaponId: v1.weaponId,
    attachments,
    orphaned,
    createdAt: v1.createdAt,
  };
}

function findSlotPathFor(modId: string, nodes: readonly SlotNodeForMigration[]): string | null {
  for (const node of nodes) {
    if (node.allowedItemIds.has(modId)) return node.path;
    const nested = findSlotPathFor(modId, node.children);
    if (nested !== null) return nested;
  }
  return null;
}
```

- [ ] **Step 4: Run the test:**

```bash
pnpm --filter @tarkov/data test -- build-migrations
```

Expected: 6 passing.

- [ ] **Step 5: Typecheck + lint:**

```bash
pnpm --filter @tarkov/data typecheck
pnpm --filter @tarkov/data lint
```

- [ ] **Step 6: Commit:**

```bash
git add packages/tarkov-data/src/build-migrations.ts packages/tarkov-data/src/build-migrations.test.ts
git commit -m "feat(tarkov-data): add migrateV1ToV2 with fixture tests"
```

---

## Phase 2: Weapon-tree data layer

### Task 3: `WEAPON_TREE_QUERY` + fetcher + normalizer

**Files:**

- Create: `packages/tarkov-data/src/queries/weaponTree.ts`
- Create: `packages/tarkov-data/src/queries/weaponTree.test.ts`

The query uses manual recursion to fetch slot → allowedItems → slot → allowedItems, capped at depth 3. A helper generates the query string to avoid copy-paste error.

Fetcher parses the raw response, then normalizes to a `SlotNode[]` tree structure easier to consume.

- [ ] **Step 1: Write `packages/tarkov-data/src/queries/weaponTree.test.ts`:**

```ts
import { describe, expect, it, vi } from "vitest";
import { fetchWeaponTree, normalizeSlots, type SlotNode } from "./weaponTree.js";
import { createTarkovClient } from "../client.js";

// Minimal fake GraphQL response matching the query shape at depth 3.
const responseFixture = {
  data: {
    item: {
      id: "w1",
      name: "Test Weapon",
      properties: {
        __typename: "ItemPropertiesWeapon",
        slots: [
          {
            id: "slot-scope",
            nameId: "mod_scope",
            name: "Scope",
            required: false,
            filters: {
              allowedItems: [
                {
                  id: "s1",
                  name: "Scope A",
                  properties: { __typename: "ItemPropertiesWeaponMod", slots: [] },
                },
                {
                  id: "s2",
                  name: "Scope B w/ mount slot",
                  properties: {
                    __typename: "ItemPropertiesWeaponMod",
                    slots: [
                      {
                        id: "slot-mount",
                        nameId: "mod_mount",
                        name: "Mount",
                        required: false,
                        filters: {
                          allowedItems: [
                            {
                              id: "m1",
                              name: "Mount A",
                              properties: { __typename: "ItemPropertiesWeaponMod", slots: [] },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
          {
            id: "slot-muzzle",
            nameId: "mod_muzzle",
            name: "Muzzle",
            required: false,
            filters: null, // some slots have null filters; fetcher must tolerate
          },
        ],
      },
    },
  },
};

describe("fetchWeaponTree", () => {
  it("returns a normalized tree", async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(responseFixture), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    const tree = await fetchWeaponTree(client, "w1");
    expect(tree.weaponId).toBe("w1");
    expect(tree.weaponName).toBe("Test Weapon");
    expect(tree.slots).toHaveLength(2);

    const scope = tree.slots[0]!;
    expect(scope.nameId).toBe("mod_scope");
    expect(scope.path).toBe("mod_scope");
    expect(scope.allowedItems).toHaveLength(2);
    expect(scope.allowedItems.map((i) => i.id)).toEqual(["s1", "s2"]);

    const scopeBChildren = scope.allowedItems[1]!.children;
    expect(scopeBChildren).toHaveLength(1);
    expect(scopeBChildren[0]!.path).toBe("mod_scope/mod_mount");

    const muzzle = tree.slots[1]!;
    expect(muzzle.nameId).toBe("mod_muzzle");
    expect(muzzle.allowedItems).toEqual([]);
  });

  it("throws if the item is missing from the response", async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: { item: null } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    await expect(fetchWeaponTree(client, "w1")).rejects.toThrow(/not found/);
  });

  it("throws if the item's properties aren't ItemPropertiesWeapon", async () => {
    const fixture = {
      data: {
        item: {
          id: "not-a-weapon",
          name: "Grenade",
          properties: { __typename: "ItemPropertiesGrenade" },
        },
      },
    };
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    await expect(fetchWeaponTree(client, "not-a-weapon")).rejects.toThrow(/not a weapon/);
  });
});

describe("normalizeSlots (exported for direct testing)", () => {
  it("produces allowedItemIds Sets for migration consumption", () => {
    const normalized = normalizeSlots(responseFixture.data.item.properties.slots, "");
    expect(normalized[0]!.allowedItemIds).toBeInstanceOf(Set);
    expect(normalized[0]!.allowedItemIds.has("s1")).toBe(true);
    expect(normalized[0]!.allowedItemIds.has("s2")).toBe(true);
  });

  it("handles null filters safely (empty allowedItems + empty allowedItemIds)", () => {
    const normalized = normalizeSlots(responseFixture.data.item.properties.slots, "");
    const muzzle = normalized[1]!;
    expect(muzzle.allowedItems).toEqual([]);
    expect(muzzle.allowedItemIds.size).toBe(0);
  });

  it("builds slot paths by joining nameIds with / separator", () => {
    const normalized = normalizeSlots(responseFixture.data.item.properties.slots, "");
    expect(normalized[0]!.path).toBe("mod_scope");
    const scopeB = normalized[0]!.allowedItems[1]!;
    expect(scopeB.children[0]!.path).toBe("mod_scope/mod_mount");
  });
});

type _SlotNode = SlotNode; // ensure the type is exported
```

- [ ] **Step 2: Run the test, expect FAIL (module not found):**

```bash
pnpm --filter @tarkov/data test -- weaponTree
```

- [ ] **Step 3: Write `packages/tarkov-data/src/queries/weaponTree.ts`:**

```ts
import { z } from "zod";
import type { GraphQLClient } from "../client.js";
import type { SlotNodeForMigration } from "../build-migrations.js";

/** Max tree depth we fetch in a single GraphQL request. */
const RECURSION_DEPTH = 3;

/**
 * Build the recursive slot selection fragment to depth N. Hand-rolled because
 * GraphQL fragment spreads can't self-reference.
 */
function buildSlotSelection(depth: number): string {
  if (depth <= 0) return "";
  return `
    id
    nameId
    name
    required
    filters {
      allowedItems {
        id
        name
        properties {
          __typename
          ... on ItemPropertiesWeaponMod {
            slots {${buildSlotSelection(depth - 1)}}
          }
        }
      }
    }`;
}

export const WEAPON_TREE_QUERY = /* GraphQL */ `
  query WeaponTree($id: ID!) {
    item(id: $id) {
      id
      name
      properties {
        __typename
        ... on ItemPropertiesWeapon {
          slots {${buildSlotSelection(RECURSION_DEPTH)}}
        }
      }
    }
  }
`;

// Zod mirrors the depth-3 response shape. We use `z.lazy` only to break the
// circular reference; the runtime tree is finite (the query caps recursion).
const ItemLeafSchema: z.ZodType<{ id: string; name: string; slots: unknown[] }> = z.lazy(() =>
  z
    .object({
      id: z.string(),
      name: z.string(),
      properties: z
        .object({
          __typename: z.string(),
          slots: z.array(RawSlotSchema).optional(),
        })
        .transform((p) => ({
          slots: p.__typename === "ItemPropertiesWeaponMod" ? (p.slots ?? []) : [],
        })),
    })
    .transform((item) => ({ id: item.id, name: item.name, slots: item.properties.slots })),
);

const RawFiltersSchema = z.object({
  allowedItems: z.array(ItemLeafSchema),
});

const RawSlotSchema: z.ZodType<{
  id: string;
  nameId: string;
  name: string;
  required: boolean;
  filters: { allowedItems: Array<{ id: string; name: string; slots: unknown[] }> } | null;
}> = z.lazy(() =>
  z.object({
    id: z.string(),
    nameId: z.string().min(1),
    name: z.string(),
    required: z.boolean(),
    filters: RawFiltersSchema.nullable(),
  }),
);

const WeaponPropertiesSchema = z.object({
  __typename: z.literal("ItemPropertiesWeapon"),
  slots: z.array(RawSlotSchema),
});

const WeaponTreeResponseSchema = z.object({
  item: z
    .object({
      id: z.string(),
      name: z.string(),
      properties: z.unknown(), // validated below by discriminator
    })
    .nullable(),
});

// ---------- Normalized output types ----------

export interface SlotNode extends SlotNodeForMigration {
  readonly name: string;
  readonly required: boolean;
  readonly allowedItems: readonly AllowedItem[];
  readonly children: readonly SlotNode[];
}

export interface AllowedItem {
  readonly id: string;
  readonly name: string;
  readonly children: readonly SlotNode[];
}

export interface WeaponTree {
  readonly weaponId: string;
  readonly weaponName: string;
  readonly slots: readonly SlotNode[];
}

// ---------- Fetcher ----------

export async function fetchWeaponTree(
  client: GraphQLClient,
  weaponId: string,
): Promise<WeaponTree> {
  const raw = await client.request<unknown>(WEAPON_TREE_QUERY, { id: weaponId });
  const envelope = WeaponTreeResponseSchema.parse(raw);
  if (!envelope.item) {
    throw new Error(`Weapon "${weaponId}" not found in tarkov-api response`);
  }
  const propsResult = WeaponPropertiesSchema.safeParse(envelope.item.properties);
  if (!propsResult.success) {
    throw new Error(`Item "${weaponId}" is not a weapon (properties.__typename mismatch)`);
  }
  return {
    weaponId: envelope.item.id,
    weaponName: envelope.item.name,
    slots: normalizeSlots(propsResult.data.slots, ""),
  };
}

// ---------- Normalizer (exported for direct testing) ----------

interface RawSlotShape {
  id: string;
  nameId: string;
  name: string;
  required: boolean;
  filters: { allowedItems: Array<{ id: string; name: string; slots?: unknown[] }> } | null;
}

export function normalizeSlots(slots: readonly unknown[], parentPath: string): readonly SlotNode[] {
  return slots.map((raw) => {
    const s = raw as RawSlotShape;
    const path = parentPath ? `${parentPath}/${s.nameId}` : s.nameId;
    const items = (s.filters?.allowedItems ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      children: normalizeSlots(item.slots ?? [], path),
    }));
    return {
      nameId: s.nameId,
      name: s.name,
      path,
      required: s.required,
      allowedItems: items,
      allowedItemIds: new Set(items.map((i) => i.id)),
      children: items.flatMap((i) => i.children),
    };
  });
}
```

**Note:** the schema pieces above are slightly more defensive than the happy path; the `.transform` chains are there so `z.lazy` circularity resolves without TS hating us. If any of the Zod inference produces an `any`, cast inside the normalizer and trust the runtime shape (we validate it there).

If the layered-schema approach fights back during implementation, fall back to a much simpler "parse envelope only, trust raw slot shape at runtime" pattern (the normalizer's `as RawSlotShape` cast already does that — the schemas become mostly ceremonial). Document that choice in the file header and move on.

- [ ] **Step 4: Run the test:**

```bash
pnpm --filter @tarkov/data test -- weaponTree
```

Expected: 6 passing.

- [ ] **Step 5: Typecheck + lint:**

```bash
pnpm --filter @tarkov/data typecheck
pnpm --filter @tarkov/data lint
```

Common issue: `z.lazy` inference can generate deep types that hit `ts(2589)`. If it does, simplify by dropping the per-item Zod and letting the normalizer do all shape work (as noted above).

- [ ] **Step 6: Commit:**

```bash
git add packages/tarkov-data/src/queries/weaponTree.ts packages/tarkov-data/src/queries/weaponTree.test.ts
git commit -m "feat(tarkov-data): add fetchWeaponTree with recursive slot normalization"
```

### Task 4: `useWeaponTree` hook + index exports

**Files:**

- Create: `packages/tarkov-data/src/hooks/useWeaponTree.ts`
- Modify: `packages/tarkov-data/src/index.ts`

- [ ] **Step 1: Write `packages/tarkov-data/src/hooks/useWeaponTree.ts`:**

```ts
import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { fetchWeaponTree, type WeaponTree } from "../queries/weaponTree.js";
import { useTarkovClient } from "../provider.js";

/**
 * Reactive weapon-with-slots fetch. Cached under `["weapon-tree", weaponId]`.
 * Disabled when weaponId is empty.
 */
export function useWeaponTree(weaponId: string): UseQueryResult<WeaponTree, Error> {
  const client = useTarkovClient();
  return useQuery({
    queryKey: ["weapon-tree", weaponId],
    queryFn: () => fetchWeaponTree(client, weaponId),
    enabled: weaponId.length > 0,
  });
}
```

- [ ] **Step 2: Edit `packages/tarkov-data/src/index.ts`. Add new exports after existing ones:**

```ts
// Weapon tree (slot-based compatibility)
export { WEAPON_TREE_QUERY, fetchWeaponTree, normalizeSlots } from "./queries/weaponTree.js";
export type { WeaponTree, SlotNode, AllowedItem } from "./queries/weaponTree.js";
export { useWeaponTree } from "./hooks/useWeaponTree.js";

// Build migrations
export { migrateV1ToV2 } from "./build-migrations.js";
export type { SlotNodeForMigration } from "./build-migrations.js";

// Build schema — update existing export to include BuildV2
```

And update the existing `// Build schema` export block to add `BuildV2`:

```ts
export { Build, BuildV1, BuildV2, CURRENT_BUILD_VERSION } from "./build-schema.js";
```

- [ ] **Step 3: Typecheck + lint + run full package test suite:**

```bash
pnpm --filter @tarkov/data typecheck
pnpm --filter @tarkov/data lint
pnpm --filter @tarkov/data test
```

Expected: all prior tests still pass + new tests pass.

- [ ] **Step 4: Commit:**

```bash
git add packages/tarkov-data/src/hooks/useWeaponTree.ts packages/tarkov-data/src/index.ts
git commit -m "feat(tarkov-data): add useWeaponTree hook + export slot-compat symbols"
```

---

## Phase 3: Builder UI — slot tree

### Task 5: New `SlotTree` component + `SlotRow` primitives

**Files:**

- Create: `apps/web/src/features/builder/slot-tree.tsx`

The SlotTree takes a `WeaponTree`, a `Record<SlotPath, ItemId>` of current attachments, and `onAttach(path, itemId | null)` / `onDetach(path)` callbacks. Each slot renders as a `<details>` with summary showing the attachment state; expanding shows a list of `allowedItems` with radio-selection semantics.

- [ ] **Step 1: Write `apps/web/src/features/builder/slot-tree.tsx`:**

```tsx
import type { SlotNode, WeaponTree } from "@tarkov/data";

export interface SlotTreeProps {
  tree: WeaponTree;
  attachments: Readonly<Record<string, string>>;
  onAttach: (path: string, itemId: string | null) => void;
}

export function SlotTree({ tree, attachments, onAttach }: SlotTreeProps) {
  if (tree.slots.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted-foreground)]">This weapon has no mod slots.</p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {tree.slots.map((slot) => (
        <SlotRow key={slot.path} slot={slot} attachments={attachments} onAttach={onAttach} />
      ))}
    </ul>
  );
}

function SlotRow({
  slot,
  attachments,
  onAttach,
}: {
  slot: SlotNode;
  attachments: Readonly<Record<string, string>>;
  onAttach: (path: string, itemId: string | null) => void;
}) {
  const selectedId = attachments[slot.path] ?? null;
  const selectedItem = selectedId ? slot.allowedItems.find((i) => i.id === selectedId) : null;

  return (
    <li className="rounded-[var(--radius)] border">
      <details>
        <summary className="flex cursor-pointer items-center justify-between gap-2 p-3 hover:bg-[var(--color-accent)]">
          <div className="flex flex-col">
            <span className="text-sm font-medium">{slot.name}</span>
            <span className="text-xs text-[var(--color-muted-foreground)]">
              {selectedItem ? selectedItem.name : "+ empty"}
              {slot.required && !selectedItem && (
                <span className="ml-2 text-[var(--color-destructive)]">required</span>
              )}
            </span>
          </div>
          <span className="text-xs text-[var(--color-muted-foreground)]">
            {slot.allowedItems.length} option{slot.allowedItems.length === 1 ? "" : "s"}
          </span>
        </summary>
        <div className="border-t p-2">
          {slot.allowedItems.length === 0 ? (
            <p className="p-2 text-xs text-[var(--color-muted-foreground)]">
              No explicit allowed items — this slot may be category-based (deferred).
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              <li>
                <button
                  type="button"
                  onClick={() => onAttach(slot.path, null)}
                  className={`w-full rounded-[var(--radius)] p-2 text-left text-sm ${
                    !selectedId ? "bg-[var(--color-accent)]" : "hover:bg-[var(--color-accent)]"
                  }`}
                >
                  (none)
                </button>
              </li>
              {slot.allowedItems.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onAttach(slot.path, item.id)}
                    className={`w-full rounded-[var(--radius)] p-2 text-left text-sm ${
                      selectedId === item.id
                        ? "bg-[var(--color-accent)]"
                        : "hover:bg-[var(--color-accent)]"
                    }`}
                  >
                    {item.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selectedItem && selectedItem.children.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2 border-l-2 pl-3">
              {selectedItem.children.map((child) => (
                <SlotRow
                  key={child.path}
                  slot={child}
                  attachments={attachments}
                  onAttach={onAttach}
                />
              ))}
            </ul>
          )}
        </div>
      </details>
    </li>
  );
}
```

- [ ] **Step 2: Typecheck:**

```bash
pnpm --filter @tarkov/web typecheck
```

- [ ] **Step 3: Commit (no test for this component yet — UI tests live in Playwright which is deferred):**

```bash
git add apps/web/src/features/builder/slot-tree.tsx
git commit -m "feat(web): add SlotTree component for slot-based mod picker"
```

### Task 6: Orphaned-mods banner

**Files:**

- Create: `apps/web/src/features/builder/orphaned-banner.tsx`

- [ ] **Step 1: Write `apps/web/src/features/builder/orphaned-banner.tsx`:**

```tsx
import { Card, CardContent } from "@tarkov/ui";

export interface OrphanedBannerProps {
  /** Mod ids that couldn't be placed in the current slot tree. */
  orphanedIds: readonly string[];
  /** Lookup: id → display name (from useModList). Unknown ids render as the raw id. */
  names: Readonly<Record<string, string>>;
  /** Fires when the user dismisses the banner — parent should clear orphaned from state. */
  onDismiss: () => void;
}

export function OrphanedBanner({ orphanedIds, names, onDismiss }: OrphanedBannerProps) {
  if (orphanedIds.length === 0) return null;
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 pt-6">
        <div className="flex-1">
          <p className="text-sm font-medium">
            {orphanedIds.length} mod{orphanedIds.length === 1 ? "" : "s"} from the saved build
            couldn't be placed in this weapon's slots.
          </p>
          <ul className="mt-2 text-xs text-[var(--color-muted-foreground)]">
            {orphanedIds.map((id) => (
              <li key={id}>{names[id] ?? id}</li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs underline underline-offset-4 hover:opacity-80"
        >
          Dismiss
        </button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck:**

```bash
pnpm --filter @tarkov/web typecheck
```

- [ ] **Step 3: Commit:**

```bash
git add apps/web/src/features/builder/orphaned-banner.tsx
git commit -m "feat(web): add OrphanedBanner for unplaceable mods from v1 migration"
```

---

## Phase 4: Wire everything together in `builder.tsx`

### Task 7: Refactor `BuilderPage` to v2 state + slot tree

This is the biggest task of the PR. The flat `Set<modId>` is replaced by `Record<SlotPath, ItemId>` attachments + `orphaned: string[]`. Load-path accepts v1 or v2 via initial props; v1 gets migrated once `useWeaponTree` resolves. The save path always produces `BuildV2`.

**Files:**

- Modify: `apps/web/src/routes/builder.tsx`

This task is structural. Rather than prescribe every line, the implementer should:

1. Read the current `builder.tsx` carefully.
2. Replace the flat-mod state machine with the slot-aware one described below.
3. Preserve every other behavior (Share button, upstream-drift warning, toast auto-cleanup, `notice` slot).

- [ ] **Step 1: Update `BuilderPageProps`.** The old `initialModIds?: string[]` is still accepted for v1-hydration. Add `initialAttachments?: Record<string, string>` and `initialOrphaned?: string[]` for v2-hydration. (One of the two shapes is always passed; never both.)

```tsx
export interface BuilderPageProps {
  initialWeaponId?: string;
  /** v1 hydration — flat list of mod ids. Will be migrated once the weapon tree loads. */
  initialModIds?: string[];
  /** v2 hydration — slot → item id map. */
  initialAttachments?: Record<string, string>;
  /** v2 hydration — unplaceable mods from an earlier v1 migration. */
  initialOrphaned?: string[];
  notice?: React.ReactNode;
}
```

- [ ] **Step 2: Replace the state.** Remove `selectedModIds: Set<string>` and all mutation sites (`toggleMod`, `clearMods`). Add:

```tsx
const [attachments, setAttachments] = useState<Record<string, string>>(
  () => initialAttachments ?? {},
);
const [orphaned, setOrphaned] = useState<string[]>(() => initialOrphaned ?? []);
```

When the weapon changes (user picks a different weapon from the dropdown), wipe `attachments` + `orphaned`:

```tsx
function handleWeaponChange(newId: string) {
  setWeaponId(newId);
  setAttachments({});
  setOrphaned([]);
}
```

- [ ] **Step 3: Fetch the weapon tree.** After the existing `weapons` and `mods` hooks:

```tsx
const tree = useWeaponTree(weaponId);
```

- [ ] **Step 4: Migrate v1 initial state when the tree loads.** Add a `useEffect` that runs once when `initialModIds` was passed and the tree has data:

```tsx
const migratedRef = useRef(false);
useEffect(() => {
  if (migratedRef.current) return;
  if (!initialModIds) return;
  if (!tree.data) return;
  const v1: BuildV1 = {
    version: 1,
    weaponId: initialWeaponId,
    modIds: initialModIds,
    createdAt: new Date(0).toISOString(),
  };
  // Flatten the normalized tree to the migration-friendly shape.
  const flat = tree.data.slots as unknown as readonly SlotNodeForMigration[];
  const v2 = migrateV1ToV2(v1, flat);
  setAttachments(v2.attachments);
  setOrphaned(v2.orphaned);
  migratedRef.current = true;
}, [initialModIds, initialWeaponId, tree.data]);
```

Import `useRef`, `useEffect`, `migrateV1ToV2`, `BuildV1`, `SlotNodeForMigration` as needed.

- [ ] **Step 5: Recompute `spec`.** The old spec used `selectedMods` derived from `selectedModIds`. Now derive it from the `attachments` record:

```tsx
const selectedMods = useMemo(
  () => (mods.data ? mods.data.filter((m) => Object.values(attachments).includes(m.id)) : []),
  [mods.data, attachments],
);
```

The `spec` `useMemo` stays the same — it already takes `selectedMods`.

- [ ] **Step 6: Update the save flow.** `handleShare` now produces `BuildV2`:

```tsx
saveMutation.mutate(
  {
    version: CURRENT_BUILD_VERSION,
    weaponId: selectedWeapon.id,
    attachments,
    orphaned,
    createdAt: new Date().toISOString(),
  },
  { onSuccess: /* unchanged */ },
);
```

- [ ] **Step 7: Replace the flat checkbox list with `<SlotTree>`.** Delete the entire "Mods" card (checklist + filter). Add a new "Mods" card rendering:

```tsx
{
  selectedWeapon && (
    <Card>
      <CardHeader>
        <CardTitle>Mods</CardTitle>
        <CardDescription>
          {tree.isLoading && "Loading slot tree…"}
          {tree.error && (
            <span className="text-[var(--color-destructive)]">
              Couldn't load slot tree: {tree.error.message}
            </span>
          )}
          {tree.data && `${Object.keys(attachments).length} attached`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {tree.data && (
          <SlotTree
            tree={tree.data}
            attachments={attachments}
            onAttach={(path, itemId) =>
              setAttachments((prev) => {
                const next = { ...prev };
                if (itemId === null) delete next[path];
                else next[path] = itemId;
                return next;
              })
            }
          />
        )}
        <OrphanedBanner
          orphanedIds={orphaned}
          names={modNamesById}
          onDismiss={() => setOrphaned([])}
        />
      </CardContent>
    </Card>
  );
}
```

Add `modNamesById`:

```tsx
const modNamesById = useMemo(
  () => Object.fromEntries((mods.data ?? []).map((m) => [m.id, m.name])),
  [mods.data],
);
```

- [ ] **Step 8: Update the upstream-drift memo.** The old version checked `initialModIds` against `mods.data`. Now also check `initialAttachments` values (mods) + `initialWeaponId`:

```tsx
const upstreamDrift = useMemo(() => {
  if (!initialWeaponId) return null;
  if (!weapons.data || !mods.data) return null;

  const missingWeapon = !weapons.data.some((w) => w.id === initialWeaponId);
  const knownModIds = new Set(mods.data.map((m) => m.id));
  const v1Missing = (initialModIds ?? []).filter((id) => !knownModIds.has(id));
  const v2Missing = Object.values(initialAttachments ?? {}).filter((id) => !knownModIds.has(id));
  const missingModIds = [...v1Missing, ...v2Missing];

  if (!missingWeapon && missingModIds.length === 0) return null;
  // (return the same Card as before, with the same copy)
  // ...
}, [initialWeaponId, initialModIds, initialAttachments, weapons.data, mods.data]);
```

- [ ] **Step 9: Typecheck + lint + test:**

```bash
pnpm --filter @tarkov/web typecheck
pnpm --filter @tarkov/web lint
pnpm --filter @tarkov/web test
```

- [ ] **Step 10: Commit:**

```bash
git add apps/web/src/routes/builder.tsx
git commit -m "feat(web): replace flat mod list with slot tree; save/load v2 builds"
```

### Task 8: Wire v2 loading into `/builder/$id`

**Files:**

- Modify: `apps/web/src/routes/builder.$id.tsx`

The loader route currently passes `build.modIds` to `BuilderPage`. Now it needs to branch on version: v1 → pass `initialModIds`; v2 → pass `initialAttachments` + `initialOrphaned`.

- [ ] **Step 1: Edit `apps/web/src/routes/builder.$id.tsx`. Find the `<BuilderPage initialWeaponId initialModIds notice />` usage and replace with:**

```tsx
const build = query.data;
const commonProps = {
  initialWeaponId: build.weaponId,
  notice: (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Loaded build <code>{id}</code>. Changes you make here won't update the saved copy — use
          "Share build" to create a new URL.
        </p>
      </CardContent>
    </Card>
  ),
} as const;

if (build.version === 1) {
  return <BuilderPage {...commonProps} initialModIds={build.modIds} />;
}
return (
  <BuilderPage
    {...commonProps}
    initialAttachments={build.attachments}
    initialOrphaned={build.orphaned}
  />
);
```

- [ ] **Step 2: Typecheck + lint:**

```bash
pnpm --filter @tarkov/web typecheck
pnpm --filter @tarkov/web lint
```

- [ ] **Step 3: Commit:**

```bash
git add apps/web/src/routes/builder.\$id.tsx
git commit -m "feat(web): route v1/v2 builds to BuilderPage via version-discriminated hydration"
```

---

## Phase 5: Verification + ship

### Task 9: Repo-wide CI gates

- [ ] **Step 1: Run the full suite:**

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
```

All clean.

### Task 10: Manual round-trip verification (Playwright still deferred)

- [ ] Start both dev servers:

```bash
pnpm --filter @tarkov/builds-api dev
pnpm --filter @tarkov/web dev
```

- [ ] Happy path (v2): at `/builder`, pick a weapon, expand a slot, attach a mod, click **Share build**. Navigate to `/builder/<id>` — attachments hydrate into the slot tree.

- [ ] v1 migration: POST a v1 build with a realistic weaponId + modIds via curl:

```bash
curl -sS -X POST http://localhost:5173/api/builds \
  -H 'Content-Type: application/json' \
  -d '{"version":1,"weaponId":"<real-ak-id>","modIds":["<real-mod-1>","<unknown-mod>"],"createdAt":"2026-04-20T00:00:00.000Z"}'
```

Navigate to the returned id. Expect: tree loads, the known mod appears attached at its slot, the unknown mod shows in the OrphanedBanner.

- [ ] Slot-tree sanity: clicking "(none)" inside an attached slot removes the attachment from the spec numbers. Clicking the currently-selected mod is a no-op.

- [ ] Empty slot-tree: a weapon with no mod slots should render the "This weapon has no mod slots." fallback.

- [ ] Error state: kill `builds-api`, hit `/builder/<id>` — the existing "Try again" flow still works.

### Task 11: Final cross-cutting review + PR

- [ ] Dispatch a `superpowers:code-reviewer` agent over the full branch diff (`git diff main...HEAD`) to catch cross-file issues.

- [ ] Push + open PR:

```bash
git push -u origin feat/builder-robustness-pr2-slot-compat
gh pr create --base main --title "feat(builder): slot-based mod compatibility + schema v2 (M1.5 PR 2)" --body "$(cat <<'EOF'
## Summary

Second PR of the Milestone 1.5 Builder Robustness arc. Replaces `/builder`'s flat mod checklist with a slot tree derived from the weapon's actual `ItemSlot` graph. Invalid attachments become structurally impossible.

### `packages/tarkov-data`

- `BuildV2` schema (slot paths + orphaned bucket), `CURRENT_BUILD_VERSION` bumped to 2.
- `migrateV1ToV2` pure function — places each v1 mod in the first accepting slot, silently dedupes, caps orphaned at 64.
- `WEAPON_TREE_QUERY` + `fetchWeaponTree` + `normalizeSlots` — recursive slot fetch to depth 3 with a string-builder helper for the query; tolerant of null filters.
- `useWeaponTree` hook.

### `apps/web`

- New `features/builder/` — `SlotTree`, `OrphanedBanner`.
- `/builder` replaces flat checklist with the slot tree; save flow writes v2.
- `/builder/$id` version-discriminates the loaded build — v1 is hydrated as `initialModIds` and migrated inside `BuilderPage` once the tree loads; v2 is hydrated directly as `initialAttachments` + `initialOrphaned`.

## Known limitations (documented in the plan)

- **Recursion depth = 3.** Enough for every common weapon today; bump to 5 if a needful weapon appears.
- **`allowedCategories` ignored.** Slot filtering uses only `allowedItems`. Category-based slots (e.g. "any rail") render with an empty picker. Noted as a PR 4 polish item.
- **No `Dialog` primitive yet.** Expandable `<details>` rows instead. PR 3 revisits if the profile drawer needs a real modal.

## Test plan

Unit: BuildV2 schema (5 new tests), `migrateV1ToV2` (6 fixture tests), `fetchWeaponTree` (3 tests), `normalizeSlots` (3 tests) — all passing.

Manual (Playwright still deferred):

- [ ] v2 round-trip: save with attachments, open /builder/$id, verify slot tree hydrates correctly.
- [ ] v1→v2 migration: curl-POST a v1 build with a real weaponId + known and unknown mod ids, open it, verify attached + orphaned split.
- [ ] Empty slot tree: a weapon with no slots renders the fallback message.
- [ ] Spec numbers update when attaching/detaching via the slot tree.

## Out of scope (tracked)

- Player-progression gating → PR 3 (schema v3).
- Name / description / presets / undo-redo → PR 4 (schema v4).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] Monitor CI; once green, merge:

```bash
gh pr merge <N> --squash --delete-branch
```

- [ ] Release-please will open a v1.2.0 PR. Admin-merge per the root CLAUDE.md known-limitation note.

---

## Deviations from the spec

1. **Recursion depth 3 not 5** — see "Design decisions" §1.
2. **`allowedCategories` ignored** — see §2.
3. **No `Dialog` primitive** — see §3.
4. **`modList` query not extended** — not needed since categories are ignored. If PR 4 adds category resolution, `MOD_LIST_QUERY` will gain `categories { id }`.
5. **Playwright e2e still deferred** — same infrastructure-PR reasoning as PR 1.
