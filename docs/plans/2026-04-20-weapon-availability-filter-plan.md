# Weapon availability filter + Builder smoke hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Filter the Builder's weapon dropdown to only the weapons your current player profile can actually acquire (with a "Show all" toggle override), AND strengthen the Builder Playwright smoke so the next GraphQL / data error surfaces in CI instead of in prod.

**Why:** User reported the weapon dropdown shows every weapon regardless of trader LLs. And the recent WeaponTree parse-error bug (PR #71) rendered as DOM text inside the Mods card — our Playwright smoke watches `console.error` only, so it slipped. Hardening the smoke to assert "no error banner text" closes that gap.

**Architecture:**

1. Extract the shared GraphQL `buyFor` fragment + Zod schemas to `packages/tarkov-data/src/queries/shared/buy-for.ts` (currently duplicated between `modList` and nowhere else — we're about to add a second consumer).
2. Extend `weaponList` query + schema to include `types` + `buyFor` — the same fields `itemAvailability` needs.
3. Generalize `itemAvailability` to accept a minimal input shape `{ buyFor, types }` so both `ModListItem` and `WeaponListItem` satisfy it structurally. No behavioural change for mods.
4. In `apps/web/src/routes/builder.tsx`: compute `weaponAvailabilityById`, filter `weaponOptions` by availability, add a "Show all weapons" checkbox that mirrors the existing "Show all items" toggle for mods.
5. In `apps/web/e2e/smoke.spec.ts`: after selecting a weapon, assert the DOM does NOT contain `"Couldn't load slot tree"`.

---

## Reference

- **Existing availability logic:** `packages/tarkov-data/src/item-availability.ts`. Takes `ModListItem`, walks `buyFor`, returns a discriminated union.
- **Existing filter pattern:** `/builder` mod list already dims unavailable mods with a "Show all items" toggle. Reuse the vocabulary.
- **Existing Playwright smoke:** `apps/web/e2e/smoke.spec.ts` has a Builder-interaction test — pick first weapon, wait for Mods card. Add one assertion.
- **ModList schema to mirror:** `packages/tarkov-data/src/queries/modList.ts` lines 48–87 have `buyForEntrySchema` + vendor schemas that we'll extract to the shared module.

## Scope decisions

1. **Generalize not duplicate.** `itemAvailability` takes a minimal `{ buyFor, types }` interface. Don't create a sibling `weaponAvailability` function — the logic is identical.
2. **Extract `buyFor` schema to shared module.** Two consumers now (`modList`, `weaponList`). Don't duplicate.
3. **Default filter = hide unavailable weapons.** "Show all weapons" toggle override. Matches existing mod UX pattern.
4. **Separate toggle state from the mod `showAll`.** Weapons and mods can be filtered independently. New state `showAllWeapons`.
5. **Smoke assertion is DOM-level.** `expect(page.getByText('Couldn't load slot tree')).toHaveCount(0)` after weapon-select. Doesn't replace the console-error listener; adds to it.
6. **No new primitives.** Reuse existing `<Pill>` + Tailwind classes.

## File map

```
packages/tarkov-data/src/
├── queries/shared/
│   ├── buy-for.ts                 NEW — GraphQL fragment + Zod schemas + types
│   └── buy-for.test.ts            NEW — Zod parse tests for trader + flea shapes
├── queries/modList.ts             MODIFIED — import shared buyFor + fragment
├── queries/weaponList.ts          MODIFIED — add buyFor + types to query + schema
├── queries/weaponList.test.ts     MODIFIED — update sample + add availability-shape test
├── item-availability.ts           MODIFIED — generalize input to { buyFor, types }
└── item-availability.test.ts      MODIFIED — add weapon-shape coverage

apps/web/src/routes/
└── builder.tsx                    MODIFIED — weapon availability map + filter + toggle

apps/web/e2e/
└── smoke.spec.ts                  MODIFIED — assert no "Couldn't load slot tree" text
```

---

## Task 0: Worktree + baseline

```bash
cd ~/TarkovGunsmith
git fetch origin
git worktree add .worktrees/weapon-availability -b feat/weapon-availability-filter origin/main
cd .worktrees/weapon-availability
pnpm install --frozen-lockfile
pnpm --filter "./packages/*" build
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
```

All green. Record the baseline test count — we should keep all existing tests green and add a few.

---

## Task 1: Extract shared `buyFor` schema

**Files:**

- Create: `packages/tarkov-data/src/queries/shared/buy-for.ts`
- Create: `packages/tarkov-data/src/queries/shared/buy-for.test.ts`

- [ ] **Step 1: Read `modList.ts`** to see the exact shape of the vendor + buyForEntry schemas and the GraphQL fragment they encode.

```bash
cat packages/tarkov-data/src/queries/modList.ts
```

- [ ] **Step 2: Create `queries/shared/buy-for.ts`.** Move the schemas out verbatim and export both the GraphQL fragment string and the Zod schemas:

```ts
import { z } from "zod";

/**
 * GraphQL fragment that fetches the `buyFor` block for any `Item`. Shared
 * between the mod-list and weapon-list queries because `itemAvailability`
 * walks the same shape for both.
 */
export const BUY_FOR_FRAGMENT = /* GraphQL */ `
  fragment BuyFor on Item {
    buyFor {
      priceRUB
      currency
      vendor {
        __typename
        normalizedName
        ... on TraderOffer {
          minTraderLevel
          taskUnlock {
            id
            normalizedName
          }
          trader {
            normalizedName
          }
        }
        ... on FleaMarket {
          minPlayerLevel
        }
      }
    }
  }
`;

const traderOfferVendorSchema = z.object({
  __typename: z.literal("TraderOffer"),
  normalizedName: z.string(),
  minTraderLevel: z.number().int().nullable(),
  taskUnlock: z
    .object({
      id: z.string().nullable(),
      normalizedName: z.string(),
    })
    .nullable(),
  trader: z.object({
    normalizedName: z.string(),
  }),
});

const fleaMarketVendorSchema = z.object({
  __typename: z.literal("FleaMarket"),
  normalizedName: z.string(),
  minPlayerLevel: z.number().int().nullable(),
});

export const vendorSchema = z.discriminatedUnion("__typename", [
  traderOfferVendorSchema,
  fleaMarketVendorSchema,
]);

export const buyForEntrySchema = z.object({
  priceRUB: z.number().int().nullable(),
  currency: z.string(),
  vendor: vendorSchema,
});

export type BuyForEntry = z.infer<typeof buyForEntrySchema>;
export type Vendor = z.infer<typeof vendorSchema>;
```

- [ ] **Step 3: Create `queries/shared/buy-for.test.ts`** — minimum parse sanity.

```ts
import { describe, expect, it } from "vitest";
import { buyForEntrySchema } from "./buy-for.js";

describe("buyForEntrySchema", () => {
  it("parses a trader offer", () => {
    const parsed = buyForEntrySchema.parse({
      priceRUB: 10000,
      currency: "RUB",
      vendor: {
        __typename: "TraderOffer",
        normalizedName: "prapor",
        minTraderLevel: 2,
        taskUnlock: null,
        trader: { normalizedName: "prapor" },
      },
    });
    expect(parsed.vendor.__typename).toBe("TraderOffer");
  });

  it("parses a flea market offer", () => {
    const parsed = buyForEntrySchema.parse({
      priceRUB: 5000,
      currency: "RUB",
      vendor: {
        __typename: "FleaMarket",
        normalizedName: "flea-market",
        minPlayerLevel: 15,
      },
    });
    expect(parsed.vendor.__typename).toBe("FleaMarket");
  });
});
```

- [ ] **Step 4: Commit.**

```bash
git add packages/tarkov-data/src/queries/shared/
git commit -m "refactor(data): extract buyFor schema + fragment for reuse"
```

---

## Task 2: Update `modList.ts` to import shared buyFor

**Files:**

- Modify: `packages/tarkov-data/src/queries/modList.ts`

- [ ] **Step 1: Replace the inline vendor / buyForEntry schemas** with imports from `./shared/buy-for.js`. Keep the query string, the mod-specific property schema, and `ModListItem` export intact. The `buyFor` block in the GraphQL query stays as-is (inlined, same fields) — we don't have to use the shared fragment reference via `${BUY_FOR_FRAGMENT}` yet because `graphql-request` needs fragments explicitly composed; leave the inline query literal and only dedupe the Zod parsing.

The types `ModListBuyFor` and `ModListVendor` already re-export the schemas. Update them to re-export from the shared module (keep them as public surface for backward compat with any consumers).

- [ ] **Step 2: Run mod tests.**

```bash
pnpm --filter @tarkov/data test modList
```

No change expected — 100% behaviour equivalence.

- [ ] **Step 3: Commit.**

```bash
git add packages/tarkov-data/src/queries/modList.ts
git commit -m "refactor(data): modList uses shared buyFor schema"
```

---

## Task 3: Extend `weaponList.ts` with `types` + `buyFor`

**Files:**

- Modify: `packages/tarkov-data/src/queries/weaponList.ts`
- Modify: `packages/tarkov-data/src/queries/weaponList.test.ts`

- [ ] **Step 1: Update the query + schema.** Add `types` and `buyFor` to `WEAPON_LIST_QUERY`, import `buyForEntrySchema` from the shared module, add the fields to `weaponListItemSchema`.

Target query shape:

```graphql
query WeaponList {
  items(type: gun) {
    id
    name
    shortName
    iconLink
    weight
    types
    properties { ... (unchanged) ... }
    buyFor {
      priceRUB
      currency
      vendor {
        __typename
        normalizedName
        ... on TraderOffer {
          minTraderLevel
          taskUnlock { id normalizedName }
          trader { normalizedName }
        }
        ... on FleaMarket {
          minPlayerLevel
        }
      }
    }
  }
}
```

Schema:

```ts
const weaponListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  iconLink: z.string().url(),
  weight: z.number(),
  types: z.array(z.string()),
  properties: weaponPropertiesSchema,
  buyFor: z.array(buyForEntrySchema),
});
```

Update `WeaponListItem` type inference to reflect the new fields (automatic via `z.infer`).

- [ ] **Step 2: Update `weaponList.test.ts` sample.** Add `types: []` and `buyFor: []` to `sampleWeapon`. Add a new test:

```ts
it("parses a weapon with buyFor entries", () => {
  const withBuyFor = {
    ...sampleWeapon,
    types: ["weapon"],
    buyFor: [
      {
        priceRUB: 43000,
        currency: "RUB",
        vendor: {
          __typename: "TraderOffer",
          normalizedName: "peacekeeper",
          minTraderLevel: 2,
          taskUnlock: null,
          trader: { normalizedName: "peacekeeper" },
        },
      },
    ],
  };
  const parsed = weaponListSchema.safeParse({ data: { items: [withBuyFor] } }.data);
  expect(parsed.success).toBe(true);
});
```

Also update the existing `grenadeLauncher` (in the filter-out test) to include the new fields if required by the outer envelope — actually, the existing safe-parse-per-item pattern tolerates missing fields per-item (items that fail parse are dropped with a console.debug). Inspect the existing behaviour; the grenadeLauncher test should still produce 1 valid weapon.

- [ ] **Step 3: Run tests.**

```bash
pnpm --filter @tarkov/data test weaponList
```

- [ ] **Step 4: Commit.**

```bash
git add packages/tarkov-data/src/queries/weaponList.ts packages/tarkov-data/src/queries/weaponList.test.ts
git commit -m "feat(data): weaponList carries types + buyFor for availability checks"
```

---

## Task 4: Generalize `itemAvailability`

**Files:**

- Modify: `packages/tarkov-data/src/item-availability.ts`
- Modify: `packages/tarkov-data/src/item-availability.test.ts`

- [ ] **Step 1: Add a minimal input interface** at the top of `item-availability.ts`:

```ts
import type { BuyForEntry } from "./queries/shared/buy-for.js";
// remove or keep ModListItem import depending on fallout

/**
 * Minimal shape `itemAvailability` needs. Both `ModListItem` and
 * `WeaponListItem` satisfy this structurally.
 */
export interface AvailabilityInput {
  readonly buyFor: readonly BuyForEntry[];
  readonly types: readonly string[];
}
```

- [ ] **Step 2: Change the function signature** from `(item: ModListItem, ...)` to `(item: AvailabilityInput, ...)`. No body changes — the function already only touches `item.buyFor` and `item.types`.

- [ ] **Step 3: Verify callers.** `grep -n "itemAvailability" packages/ apps/` and confirm every call site passes a value that satisfies `AvailabilityInput`. The existing mod call site does; the new weapon call site will.

- [ ] **Step 4: Add a weapon-shape test.** At the end of `item-availability.test.ts`:

```ts
describe("itemAvailability — weapon shape", () => {
  // Sanity check: a WeaponListItem-shaped object satisfies AvailabilityInput
  // and returns the expected trader path.
  it("evaluates a weapon's trader offer like any other item", () => {
    const weapon = {
      buyFor: [
        {
          priceRUB: 43000,
          currency: "RUB",
          vendor: {
            __typename: "TraderOffer",
            normalizedName: "peacekeeper",
            minTraderLevel: 2,
            taskUnlock: null,
            trader: { normalizedName: "peacekeeper" },
          },
        },
      ],
      types: ["weapon"],
    };
    const result = itemAvailability(weapon, baseProfile);
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.kind).toBe("trader");
    }
  });
});
```

(Use the existing `baseProfile` helper in the file.)

- [ ] **Step 5: Run tests.**

```bash
pnpm --filter @tarkov/data test item-availability
```

Expected: all existing green + 1 new passing.

- [ ] **Step 6: Commit.**

```bash
git add packages/tarkov-data/src/item-availability.ts packages/tarkov-data/src/item-availability.test.ts
git commit -m "feat(data): generalize itemAvailability to any { buyFor, types } input"
```

---

## Task 5: Filter weapon dropdown in `/builder`

**Files:**

- Modify: `apps/web/src/routes/builder.tsx`

- [ ] **Step 1: Add weapon availability state alongside the existing `availabilityById`.** Near the existing `availabilityById` memo (around line 114), add:

```tsx
const weaponAvailabilityById = useMemo(() => {
  const map = new Map<string, ReturnType<typeof itemAvailability>>();
  for (const w of weapons.data ?? []) {
    map.set(w.id, itemAvailability(w, profile));
  }
  return map;
}, [weapons.data, profile]);
```

- [ ] **Step 2: Add `showAllWeapons` state.** Near the existing `showAll` useState (around line 67):

```tsx
const [showAllWeapons, setShowAllWeapons] = useState(false);
```

- [ ] **Step 3: Filter `weaponOptions`.** Update the existing memo:

```tsx
const weaponOptions = useMemo(() => {
  if (!weapons.data) return [];
  const sorted = [...weapons.data].sort((a, b) => a.name.localeCompare(b.name));
  if (showAllWeapons) return sorted;
  return sorted.filter((w) => weaponAvailabilityById.get(w.id)?.available === true);
}, [weapons.data, weaponAvailabilityById, showAllWeapons]);
```

- [ ] **Step 4: Render the toggle.** In the Weapon `<Card>` (around line 263), under the existing `<select>`, add:

```tsx
<label className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
  <input
    type="checkbox"
    checked={showAllWeapons}
    onChange={(e) => setShowAllWeapons(e.target.checked)}
  />
  <span>Show all weapons (including locked by profile)</span>
</label>
```

Place it above the existing "Share build" button row.

- [ ] **Step 5: Update the CardDescription** for the Weapon card to reflect the filtered count:

```tsx
<CardDescription>
  {isLoading
    ? "Loading…"
    : `${weaponOptions.length} weapons ${showAllWeapons ? "(all)" : "available on your profile"}`}
</CardDescription>
```

- [ ] **Step 6: Typecheck + lint + test.**

```bash
pnpm --filter @tarkov/web typecheck && pnpm --filter @tarkov/web lint && pnpm --filter @tarkov/web test
```

- [ ] **Step 7: Commit.**

```bash
git add apps/web/src/routes/builder.tsx
git commit -m "feat(builder): filter weapon dropdown by player-profile availability"
```

---

## Task 6: Harden Builder Playwright smoke

**Files:**

- Modify: `apps/web/e2e/smoke.spec.ts`

- [ ] **Step 1: Read the current Builder interaction test** and add DOM-level assertions right before the console-error check. Find this block:

```ts
await expect(page.getByText(/Mods|slot tree/i).first()).toBeVisible({ timeout: 20_000 });

expect(
  errors,
  `Console errors on /builder after selecting a weapon:\n${errors.join("\n")}`,
).toEqual([]);
```

Replace with:

```ts
await expect(page.getByText(/Mods|slot tree/i).first()).toBeVisible({ timeout: 20_000 });

// Fail loudly on GraphQL / network errors rendered as card text. The recent
// WeaponTree parse-error bug surfaced here, not in the console.
await expect(page.getByText(/couldn.?t load slot tree|failed to load|graphql error/i)).toHaveCount(
  0,
);

expect(
  errors,
  `Console errors on /builder after selecting a weapon:\n${errors.join("\n")}`,
).toEqual([]);
```

- [ ] **Step 2: Rebuild + run the suite locally.**

```bash
pnpm --filter @tarkov/web build
pnpm --filter @tarkov/web test:e2e
```

All 13 should still pass. If the DOM-text assertion fails, that's a real broken state we'd want CI to catch — investigate rather than weaken the matcher.

- [ ] **Step 3: Commit.**

```bash
git add apps/web/e2e/smoke.spec.ts
git commit -m "test(web): Builder smoke asserts no error-banner text after weapon-select

Closes the gap that let the WeaponTree GraphQL parse bug ship — the
error surfaced as DOM text in the Mods card, not a console.error, so
the existing console-error listener never fired on it."
```

---

## Task 7: Full verification + push + PR

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm -r build
pnpm --filter @tarkov/web test:e2e
git push -u origin feat/weapon-availability-filter
gh pr create --title "feat(builder): filter weapon dropdown by profile + harden Builder smoke" --body "$(cat <<'EOF'
## Summary

Two related fixes bundled:

1. **Weapon dropdown filtering (Bug 1 from user report).** Extends \`weaponList\` query with \`types\` + \`buyFor\`; generalizes \`itemAvailability\` to accept any \`{ buyFor, types }\` input; filters \`/builder\`'s weapon picker to show only weapons the current \`PlayerProfile\` can acquire; adds a "Show all weapons" toggle override mirroring the existing "Show all items" pattern for mods.
2. **Builder smoke hardening.** Asserts the Mods card does NOT render "Couldn't load slot tree" / "failed to load" / "graphql error" after weapon-select. The recent WeaponTree parse-error bug (PR #71) surfaced as DOM text rather than a \`console.error\`, so the existing listener missed it. This covers that class.

### File-level changes

- \`packages/tarkov-data/src/queries/shared/buy-for.ts\` NEW — extract the shared GraphQL \`buyFor\` fragment + Zod schemas (dedup with \`modList\`).
- \`packages/tarkov-data/src/queries/modList.ts\` MODIFIED — import shared schemas.
- \`packages/tarkov-data/src/queries/weaponList.ts\` MODIFIED — query + schema now include \`types\` + \`buyFor\`.
- \`packages/tarkov-data/src/queries/weaponList.test.ts\` MODIFIED — sample fixture + availability parse test.
- \`packages/tarkov-data/src/item-availability.ts\` MODIFIED — signature takes \`AvailabilityInput\` interface (minimal \`{ buyFor, types }\` shape). No behaviour change for mods.
- \`packages/tarkov-data/src/item-availability.test.ts\` MODIFIED — weapon-shape coverage.
- \`apps/web/src/routes/builder.tsx\` MODIFIED — \`weaponAvailabilityById\` + \`showAllWeapons\` toggle + filter.
- \`apps/web/e2e/smoke.spec.ts\` MODIFIED — DOM-level error-banner assertion after weapon-select.

## Test plan

- [x] \`pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm -r build\` — all exit 0.
- [x] \`pnpm --filter @tarkov/web test:e2e\` — all Playwright smokes green.
- [x] Test count +3 (buy-for parse, weapon buyFor parse, weapon-shape availability).
- [ ] CI green.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr checks --watch
gh pr merge --squash --auto
cd ~/TarkovGunsmith
git worktree remove .worktrees/weapon-availability
git branch -D feat/weapon-availability-filter
git fetch origin --prune
```
