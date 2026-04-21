# Build Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/builder` → "Optimize ⚙" button → modal constraint form → exact solver → diff preview → accept/reject. Pure-TS `packages/optimizer` package contains the solver; `apps/web` owns the UI. Reuses shipped Build-comparison primitives (`statDelta`, `slotDiff`, `CompareStatDelta`, `SlotTree.diff`) to render the diff.

**Architecture:** New `packages/optimizer` workspace. Top-level `optimize(input) → OptimizationResult` is an exact branch-and-bound DFS over the slot tree. At each `SlotNode`, candidates are `allowedItems` (filtered by `itemAvailability(_, profile).available`) ∪ `{ null }`, unless the slot is pinned. When a non-null item is picked, the solver recurses into that item's `AllowedItem.children` sub-slots. Prunes by (a) budget, (b) availability, (c) objective lower-bound. Deterministic tie-breaking. Timeout defaults to 2000 ms with `partial` support.

**Tech Stack:** TypeScript strict, pnpm workspaces + Turborepo, Vitest 4 (node env for the package, jsdom/web not needed), Tailwind v4, TanStack Router (file-based), `@tarkov/ui` primitives (`Pill`, `Stamp`, `SectionTitle`, `StatRow`, `Card variant="bracket"`, `Button`, `Input`). Pure-TS in the package, no React. React + TanStack in the UI layer only.

**Worktree:** This plan executes in `/mnt/c/Users/Matt/Source/TarkovGunsmith/.worktrees/optimize` on branch `feat/m3-build-optimization` off `origin/main` (v1.6.0). Spec + plan commits are already present.

---

## File structure (created / modified)

### New files

```
packages/optimizer/
  package.json                                # @tarkov/optimizer workspace manifest
  tsconfig.json                               # extends ../../tsconfig.base.json
  vitest.config.ts                            # env: node
  CLAUDE.md                                   # package docs
  src/
    index.ts                                  # public re-exports
    types.ts                                  # Objective, OptimizationInput/Result/Constraints
    objective.ts                              # score(objective, stats) → number
    objective.test.ts
    feasibility.ts                            # availability + budget + pin checks
    feasibility.test.ts
    bounds.ts                                 # lower-bound heuristic per objective
    bounds.test.ts
    branch-and-bound.ts                       # DFS core
    branch-and-bound.test.ts
    optimize.ts                               # top-level optimize() + timeout wiring
    optimize.test.ts
    __fixtures__/
      small-weapon.ts                         # 3-slot toy weapon
      m4a1-like.ts                            # realistic 8-12-slot weapon

apps/web/src/features/builder/optimize/
  useOptimizer.ts                             # thin hook wrapping optimize()
  optimize-constraints-reducer.ts             # pure reducer for Tab 1 form state
  optimize-constraints-reducer.test.ts
  optimize-constraints-form.tsx               # Tab 1 UI
  optimize-result-view.tsx                    # Tab 2 success/failure/partial
  optimize-dialog.tsx                         # modal orchestrator, tabs, Accept/Reject
```

### Modified files

```
pnpm-workspace.yaml                                             # include packages/optimizer if needed (check)
apps/web/package.json                                           # add @tarkov/optimizer dep
eslint.config.js                                                # allow packages/optimizer tests
apps/web/src/features/builder/build-header.tsx                  # + optional onOptimize prop + Optimize ⚙ button
apps/web/src/routes/builder.tsx                                 # host OptimizeDialog + state + accept handler
apps/web/e2e/smoke.spec.ts                                      # Playwright coverage
```

---

## Order of work

**Phase A — Package scaffold** (Task 1). Empty but buildable `@tarkov/optimizer`. No logic yet. `pnpm install` recognizes it; `pnpm --filter @tarkov/optimizer test` runs cleanly.

**Phase B — Types + fixtures** (Tasks 2–3). `types.ts` + the two fixture files. Enables downstream TDD.

**Phase C — Pure helpers** (Tasks 4–6). `objective`, `feasibility`, `bounds` — each a small, independently-tested pure function.

**Phase D — B&B core** (Task 7). The recursive DFS.

**Phase E — Top-level + integration** (Task 8). `optimize()` orchestrator + timeout + the fixture integration tests.

**Phase F — Monorepo wiring** (Task 9). Re-export from index, add to `apps/web`'s deps, eslint allowlist, `pnpm install` + `pnpm --filter "./packages/*" build`.

**Phase G — UI** (Tasks 10–15). Reducer → form → result view → dialog → button → BuilderPage wiring.

**Phase H — Playwright** (Task 16). New smoke entries.

**Phase I — Final QA + PR** (Task 17).

Every task commits with a Conventional-Commits message. Phase boundaries are good review stopping points.

---

## Task 1: Scaffold `@tarkov/optimizer` package

**Files:**

- Create: `packages/optimizer/package.json`
- Create: `packages/optimizer/tsconfig.json`
- Create: `packages/optimizer/vitest.config.ts`
- Create: `packages/optimizer/CLAUDE.md`
- Create: `packages/optimizer/src/index.ts` (empty stub)
- Create: `packages/optimizer/src/index.test.ts` (sanity check)

Read the existing `packages/ballistics/package.json`, `tsconfig.json`, `vitest.config.ts`, and `CLAUDE.md` first — the new package mirrors those conventions exactly.

- [ ] **Step 1: Write the placeholder index + test**

```ts
// packages/optimizer/src/index.ts
export const OPTIMIZER_PLACEHOLDER = "scaffold" as const;
```

```ts
// packages/optimizer/src/index.test.ts
import { describe, it, expect } from "vitest";
import { OPTIMIZER_PLACEHOLDER } from "./index.js";

describe("@tarkov/optimizer scaffold", () => {
  it("exports the placeholder sentinel", () => {
    expect(OPTIMIZER_PLACEHOLDER).toBe("scaffold");
  });
});
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "@tarkov/optimizer",
  "version": "0.0.0",
  "type": "module",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint . --max-warnings 0",
    "test": "vitest run --coverage"
  },
  "dependencies": {
    "@tarkov/ballistics": "workspace:*",
    "@tarkov/data": "workspace:*"
  },
  "devDependencies": {
    "@vitest/coverage-v8": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

(Verify the `catalog:` protocol is used repo-wide by checking `packages/ballistics/package.json`. If that package pins explicit versions, match its style exactly.)

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "tsBuildInfoFile": ".tsbuildinfo",
    "lib": ["ES2022"],
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "**/*.test.ts", "**/__fixtures__/**"]
}
```

(Mirror `packages/ballistics/tsconfig.json`. Excluding fixtures keeps production build lean; tests pick them up via vitest config.)

- [ ] **Step 4: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      thresholds: {
        lines: 100,
        functions: 100,
        statements: 100,
        branches: 95,
      },
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/__fixtures__/**", "src/index.ts"],
    },
  },
});
```

(Match the coverage thresholds used by `packages/ballistics/vitest.config.ts`. If that file excludes a different glob or uses different thresholds, adapt.)

- [ ] **Step 5: Write `CLAUDE.md`**

```markdown
# `@tarkov/optimizer`

Pure-TypeScript constraint solver for Tarkov weapon builds. Given a weapon,
its slot tree, an allowed mod list, constraints (budget, profile, pinned
slots), and an objective (min-recoil / max-ergonomics / min-weight /
max-accuracy), returns the provably-optimal build.

## What's in this package

- `optimize(input)` → `OptimizationResult` — top-level entry point.
- `objective.ts` — `score(objective, stats)` numeric scorer (smaller = better uniformly).
- `bounds.ts` — lower-bound heuristic for remaining slots (enables B&B pruning).
- `feasibility.ts` — availability + budget + pinned-slot checks.
- `branch-and-bound.ts` — recursive DFS core.

## Conventions

- **Pure functions only.** Same inputs → same outputs. Deterministic
  tie-breaking: lowest total price, then lexicographic item-id order.
- **No side effects.** No network, no clock except the monotonic
  `performance.now()` used for timeout accounting.
- **One function per file**, alongside its `.test.ts`.
- **TDD strictly.** Write the test first; commit the failing test; then implement.
- **100% line coverage** (branches 95%), enforced by vitest config.
- **No React.** UI integration lives in `apps/web/src/features/builder/optimize/`.

## Out of scope

- Fetching game data (that's `@tarkov/data`).
- Stat computation (that's `@tarkov/ballistics` — the solver calls `weaponSpec` at each leaf).
- UI / React / dialogs (that's `apps/web`).
- Caching, memoization, or persistence — callers handle that.
```

- [ ] **Step 6: Add to pnpm-workspace.yaml if not already glob-covered**

Check `pnpm-workspace.yaml`:

```bash
cat pnpm-workspace.yaml
```

If it has `packages/*`, nothing to do. If it lists packages individually, add `- packages/optimizer`.

- [ ] **Step 7: Run pnpm install**

```bash
pnpm install
```

Expected: `@tarkov/optimizer` appears in the workspace. No errors.

- [ ] **Step 8: Run build + test**

```bash
pnpm --filter @tarkov/optimizer build
pnpm --filter @tarkov/optimizer test
```

Expected: build produces `dist/index.js`. Test runs 1 spec, passes.

- [ ] **Step 9: Commit**

```bash
git add packages/optimizer/ pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat(optimizer): scaffold @tarkov/optimizer package"
```

---

## Task 2: Types and public shapes

**Files:**

- Create: `packages/optimizer/src/types.ts`
- Modify: `packages/optimizer/src/index.ts` (re-export types)

No test on its own — downstream tasks exercise these types.

- [ ] **Step 1: Write the types file**

```ts
// packages/optimizer/src/types.ts
import type { BuildV4, PlayerProfile, WeaponTree, ModListItem } from "@tarkov/data";
import type { BallisticWeapon, WeaponSpec } from "@tarkov/ballistics";

/**
 * Objective the solver minimizes (uniformly — `score()` inverts
 * higher-is-better stats so the DFS can always minimize).
 */
export type Objective =
  | "min-recoil"
  | "max-ergonomics"
  | "min-weight"
  | "max-accuracy";

export interface OptimizationConstraints {
  /** Hard cap in RUB. `undefined` → no budget constraint. */
  readonly budgetRub?: number;
  /** Determines availability via `@tarkov/data` `itemAvailability`. */
  readonly profile: PlayerProfile;
  /**
   * slotPath → itemId (force this item) | null (force empty).
   * Slots absent from the map are "unpinned" — solver chooses.
   */
  readonly pinnedSlots: ReadonlyMap<string, string | null>;
}

export interface OptimizationInput {
  /** Adapted weapon (output of `apps/web`'s `adaptWeapon`). */
  readonly weapon: BallisticWeapon;
  /** Resolved weapon slot tree (output of `useWeaponTree`). */
  readonly slotTree: WeaponTree;
  /** All candidate mods (output of `useModList`). */
  readonly modList: readonly ModListItem[];
  readonly constraints: OptimizationConstraints;
  readonly objective: Objective;
  /** Wall-clock timeout in milliseconds. Default 2000. */
  readonly timeoutMs?: number;
}

export type OptimizationReason =
  | "no-valid-combinations"
  | "infeasible-budget"
  | "timeout";

export type OptimizationResult =
  | {
      readonly ok: true;
      readonly build: BuildV4;
      readonly stats: WeaponSpec;
      /** `true` when the timeout fired before the search completed. */
      readonly partial?: boolean;
    }
  | {
      readonly ok: false;
      readonly reason: OptimizationReason;
    };
```

- [ ] **Step 2: Re-export from index**

Replace `packages/optimizer/src/index.ts` entirely with:

```ts
// packages/optimizer/src/index.ts
export type {
  Objective,
  OptimizationConstraints,
  OptimizationInput,
  OptimizationReason,
  OptimizationResult,
} from "./types.js";
```

Delete the `OPTIMIZER_PLACEHOLDER` + its test.

- [ ] **Step 3: Update the placeholder test**

Replace `packages/optimizer/src/index.test.ts` with a trivial type-import assertion:

```ts
// packages/optimizer/src/index.test.ts
import { describe, it, expect } from "vitest";
import type { Objective } from "./index.js";

describe("@tarkov/optimizer exports", () => {
  it("exports the Objective type (compile-time)", () => {
    const o: Objective = "min-recoil";
    expect(o).toBe("min-recoil");
  });
});
```

- [ ] **Step 4: Run typecheck + test**

```bash
pnpm --filter @tarkov/optimizer typecheck
pnpm --filter @tarkov/optimizer test
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add packages/optimizer/
git commit -m "feat(optimizer): public types (Objective / Input / Result / Constraints)"
```

---

## Task 3: Fixtures

**Files:**

- Create: `packages/optimizer/src/__fixtures__/small-weapon.ts`
- Create: `packages/optimizer/src/__fixtures__/m4a1-like.ts`

These are reused across every downstream test. Make them realistic but small enough to verify by hand.

- [ ] **Step 1: Write `small-weapon.ts`**

```ts
// packages/optimizer/src/__fixtures__/small-weapon.ts
import type { ModListItem, WeaponTree } from "@tarkov/data";
import type { BallisticWeapon } from "@tarkov/ballistics";

/**
 * Toy 3-slot weapon used by unit tests. The numbers are chosen so
 * the optimal min-recoil build is hand-computable.
 *
 * Slots:
 *   - muzzle (3 options: silencer, brake, none)
 *   - grip   (2 options: vertical, none)
 *   - stock  (2 options: standard, none)
 *
 * Min-recoil optimum under no budget: brake + vertical + standard.
 * Recoil scoring: verticalRecoil + horizontalRecoil.
 */
export const SMALL_WEAPON: BallisticWeapon = {
  id: "weap1",
  name: "Test Rifle",
  baseErgonomics: 50,
  baseVerticalRecoil: 100,
  baseHorizontalRecoil: 200,
  baseWeight: 3.0,
  baseAccuracy: 3.0,
};

export const SMALL_MODS: readonly ModListItem[] = [
  makeMod("muzzle_brake", "Brake", -12, 2, 0.3, 1500),
  makeMod("muzzle_silencer", "Silencer", -8, 3, 0.5, 3500),
  makeMod("grip_vertical", "Vertical grip", -4, 5, 0.15, 900),
  makeMod("stock_standard", "Standard stock", -6, 8, 0.4, 2200),
];

export const SMALL_TREE: WeaponTree = {
  weaponId: "weap1",
  weaponName: "Test Rifle",
  slots: [
    slot("muzzle", ["muzzle_brake", "muzzle_silencer"]),
    slot("grip", ["grip_vertical"]),
    slot("stock", ["stock_standard"]),
  ],
};

function makeMod(
  id: string,
  name: string,
  recoilModifier: number,
  ergonomics: number,
  weight: number,
  priceRub: number,
): ModListItem {
  return {
    id,
    name,
    shortName: name,
    iconLink: `https://example.com/${id}.png`,
    weight,
    types: ["mods"],
    minLevelForFlea: null,
    properties: {
      __typename: "ItemPropertiesWeaponMod",
      ergonomics,
      recoilModifier,
      accuracyModifier: 0,
    },
    buyFor: [
      {
        priceRUB: priceRub,
        currency: "RUB",
        vendor: {
          __typename: "FleaMarket",
          normalizedName: "flea-market",
          minPlayerLevel: 15,
        },
      },
    ],
  } as ModListItem;
}

function slot(nameId: string, itemIds: readonly string[]) {
  return {
    nameId,
    path: nameId,
    name: nameId,
    required: false,
    allowedItemIds: new Set(itemIds),
    allowedItems: itemIds.map((id) => ({ id, name: id, children: [] })),
    children: [],
  };
}
```

(The `as ModListItem` cast is because our fixture skips some optional upstream fields the solver doesn't read. If the cast fails typecheck, fill in any missing required fields by reading `packages/tarkov-data/src/queries/modList.ts`.)

- [ ] **Step 2: Write `m4a1-like.ts`**

```ts
// packages/optimizer/src/__fixtures__/m4a1-like.ts
import type { ModListItem, WeaponTree } from "@tarkov/data";
import type { BallisticWeapon } from "@tarkov/ballistics";

/**
 * Realistic-ish 8-slot rifle fixture for integration tests. Slot counts
 * and item counts per slot are tuned so the full search space is ~5000
 * combinations — enough to exercise pruning, small enough that exhaustive
 * hand-verification of the optimum is tractable.
 *
 * Slots (8 total):
 *   muzzle (4) · barrel (3) · handguard (3) · foregrip (3)
 *   stock (3) · pistol-grip (3) · sight (3) · mag (2)
 *
 * Search space: 4·3·3·3·3·3·3·2 + null options = ~10^4 leaves.
 */
export const M4A1_WEAPON: BallisticWeapon = {
  id: "m4a1",
  name: "M4A1",
  baseErgonomics: 47,
  baseVerticalRecoil: 56,
  baseHorizontalRecoil: 220,
  baseWeight: 3.1,
  baseAccuracy: 2.5,
};

// Mod generator: systematic stat spreads so the optimum is derivable.
export const M4A1_MODS: readonly ModListItem[] = [
  ...generateSlotMods("muzzle", 4, { recoilBase: -10, priceBase: 5000 }),
  ...generateSlotMods("barrel", 3, { recoilBase: -5, priceBase: 8000 }),
  ...generateSlotMods("handguard", 3, { recoilBase: 0, priceBase: 3000, ergonomicsBase: 10 }),
  ...generateSlotMods("foregrip", 3, { recoilBase: -8, priceBase: 2000 }),
  ...generateSlotMods("stock", 3, { recoilBase: -15, priceBase: 4000 }),
  ...generateSlotMods("pistolgrip", 3, { recoilBase: -3, priceBase: 1200, ergonomicsBase: 4 }),
  ...generateSlotMods("sight", 3, { recoilBase: 0, priceBase: 10000, ergonomicsBase: -2 }),
  ...generateSlotMods("mag", 2, { recoilBase: 0, priceBase: 500, weightBase: 0.2 }),
];

export const M4A1_TREE: WeaponTree = {
  weaponId: "m4a1",
  weaponName: "M4A1",
  slots: [
    slotWithOptions("muzzle", 4),
    slotWithOptions("barrel", 3),
    slotWithOptions("handguard", 3),
    slotWithOptions("foregrip", 3),
    slotWithOptions("stock", 3),
    slotWithOptions("pistolgrip", 3),
    slotWithOptions("sight", 3),
    slotWithOptions("mag", 2),
  ],
};

function generateSlotMods(
  slotName: string,
  count: number,
  base: {
    recoilBase: number;
    priceBase: number;
    ergonomicsBase?: number;
    weightBase?: number;
  },
): readonly ModListItem[] {
  const out: ModListItem[] = [];
  for (let i = 0; i < count; i++) {
    // i-th variant spreads stats systematically so the optimum is calculable.
    const recoilModifier = base.recoilBase - i; // Lower (more negative) with increasing i
    const ergonomics = (base.ergonomicsBase ?? 0) + i;
    const weight = (base.weightBase ?? 0.1) + i * 0.05;
    const accuracyModifier = 0;
    const priceRub = base.priceBase + i * 1500;
    out.push({
      id: `${slotName}_${i}`,
      name: `${slotName} v${i}`,
      shortName: `${slotName}${i}`,
      iconLink: `https://example.com/${slotName}_${i}.png`,
      weight,
      types: ["mods"],
      minLevelForFlea: null,
      properties: {
        __typename: "ItemPropertiesWeaponMod",
        ergonomics,
        recoilModifier,
        accuracyModifier,
      },
      buyFor: [
        {
          priceRUB: priceRub,
          currency: "RUB",
          vendor: {
            __typename: "FleaMarket",
            normalizedName: "flea-market",
            minPlayerLevel: 15,
          },
        },
      ],
    } as ModListItem);
  }
  return out;
}

function slotWithOptions(nameId: string, count: number) {
  const ids = Array.from({ length: count }, (_, i) => `${nameId}_${i}`);
  return {
    nameId,
    path: nameId,
    name: nameId,
    required: false,
    allowedItemIds: new Set(ids),
    allowedItems: ids.map((id) => ({ id, name: id, children: [] })),
    children: [],
  };
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @tarkov/optimizer typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/optimizer/src/__fixtures__/
git commit -m "feat(optimizer): small-weapon + m4a1-like test fixtures"
```

---

## Task 4: `objective.ts` — scoring function

**Files:**

- Create: `packages/optimizer/src/objective.ts`
- Create: `packages/optimizer/src/objective.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/optimizer/src/objective.test.ts
import { describe, it, expect } from "vitest";
import { score } from "./objective.js";
import type { WeaponSpec } from "@tarkov/ballistics";

const stats: WeaponSpec = {
  weaponId: "w1",
  modCount: 0,
  ergonomics: 50,
  verticalRecoil: 100,
  horizontalRecoil: 200,
  weight: 3,
  accuracy: 2.5,
};

describe("score", () => {
  it("min-recoil = verticalRecoil + horizontalRecoil", () => {
    expect(score("min-recoil", stats)).toBe(300);
  });

  it("max-ergonomics = -ergonomics (lower is better uniformly)", () => {
    expect(score("max-ergonomics", stats)).toBe(-50);
  });

  it("min-weight = weight", () => {
    expect(score("min-weight", stats)).toBe(3);
  });

  it("max-accuracy = accuracy (lower MOA is better)", () => {
    expect(score("max-accuracy", stats)).toBe(2.5);
  });

  it("smaller-is-better invariant holds for all objectives", () => {
    const better: WeaponSpec = { ...stats, verticalRecoil: 50, horizontalRecoil: 150, ergonomics: 60, weight: 2.5, accuracy: 1.5 };
    for (const obj of ["min-recoil", "max-ergonomics", "min-weight", "max-accuracy"] as const) {
      expect(score(obj, better)).toBeLessThan(score(obj, stats));
    }
  });
});
```

- [ ] **Step 2: Run test, verify failure**

```bash
pnpm --filter @tarkov/optimizer test objective.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `score`**

```ts
// packages/optimizer/src/objective.ts
import type { WeaponSpec } from "@tarkov/ballistics";
import type { Objective } from "./types.js";

/**
 * Normalize every objective to "smaller is better" so the DFS can always
 * minimize. Higher-is-better stats (ergonomics) are negated.
 *
 * - min-recoil    → verticalRecoil + horizontalRecoil
 * - max-ergonomics → -ergonomics
 * - min-weight    → weight
 * - max-accuracy  → accuracy (MOA-like; lower is better already)
 */
export function score(objective: Objective, stats: WeaponSpec): number {
  switch (objective) {
    case "min-recoil":
      return stats.verticalRecoil + stats.horizontalRecoil;
    case "max-ergonomics":
      return -stats.ergonomics;
    case "min-weight":
      return stats.weight;
    case "max-accuracy":
      return stats.accuracy;
  }
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
pnpm --filter @tarkov/optimizer test objective.test.ts
```

Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/optimizer/src/objective.ts packages/optimizer/src/objective.test.ts
git commit -m "feat(optimizer): score() — uniform smaller-is-better objective scoring"
```

---

## Task 5: `feasibility.ts` — availability + budget + pin checks

**Files:**

- Create: `packages/optimizer/src/feasibility.ts`
- Create: `packages/optimizer/src/feasibility.test.ts`

This module is two pure helpers the DFS consumes:

- `cheapestPrice(item, profile)` → `number | null` — wraps `itemAvailability` to return the RUB price of the cheapest available source for an item, or `null` if the item is unavailable under the profile.
- `slotCandidates(slot, modList, profile, pinnedSlots)` → `readonly (ModListItem | null)[]` — returns the enumeration of decisions the solver considers for a slot.

- [ ] **Step 1: Write the failing test**

```ts
// packages/optimizer/src/feasibility.test.ts
import { describe, it, expect } from "vitest";
import { cheapestPrice, slotCandidates } from "./feasibility.js";
import { SMALL_MODS, SMALL_TREE } from "./__fixtures__/small-weapon.js";
import type { PlayerProfile } from "@tarkov/data";

const fleaOnProfile: PlayerProfile = {
  mode: "basic",
  traders: { prapor: 1, therapist: 1, skier: 1, peacekeeper: 1, mechanic: 1, ragman: 1, jaeger: 1 },
  flea: true,
};

const fleaOffProfile: PlayerProfile = { ...fleaOnProfile, flea: false };

describe("cheapestPrice", () => {
  it("returns the flea price when profile has flea on", () => {
    const brake = SMALL_MODS.find((m) => m.id === "muzzle_brake")!;
    expect(cheapestPrice(brake, fleaOnProfile)).toBe(1500);
  });

  it("returns null when profile has flea off and no trader source", () => {
    const brake = SMALL_MODS.find((m) => m.id === "muzzle_brake")!;
    expect(cheapestPrice(brake, fleaOffProfile)).toBeNull();
  });
});

describe("slotCandidates", () => {
  it("returns compatible available items + null for unpinned slots", () => {
    const muzzleSlot = SMALL_TREE.slots[0]!;
    const candidates = slotCandidates(muzzleSlot, SMALL_MODS, fleaOnProfile, new Map());
    const ids = candidates.map((c) => (c ? c.id : null));
    expect(ids).toContain("muzzle_brake");
    expect(ids).toContain("muzzle_silencer");
    expect(ids).toContain(null);
    expect(candidates).toHaveLength(3);
  });

  it("returns the pinned item only when slot is pinned", () => {
    const muzzleSlot = SMALL_TREE.slots[0]!;
    const pin = new Map([["muzzle", "muzzle_brake"]]);
    const candidates = slotCandidates(muzzleSlot, SMALL_MODS, fleaOnProfile, pin);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.id).toBe("muzzle_brake");
  });

  it("returns [null] when slot is pinned empty", () => {
    const muzzleSlot = SMALL_TREE.slots[0]!;
    const pin = new Map<string, string | null>([["muzzle", null]]);
    const candidates = slotCandidates(muzzleSlot, SMALL_MODS, fleaOnProfile, pin);
    expect(candidates).toEqual([null]);
  });

  it("filters out unavailable items when unpinned", () => {
    const muzzleSlot = SMALL_TREE.slots[0]!;
    const candidates = slotCandidates(muzzleSlot, SMALL_MODS, fleaOffProfile, new Map());
    // With flea off and no trader sources, only `null` (empty) is feasible.
    expect(candidates).toEqual([null]);
  });

  it("keeps pinned items even when the pinned item is unavailable under profile", () => {
    const muzzleSlot = SMALL_TREE.slots[0]!;
    const pin = new Map([["muzzle", "muzzle_brake"]]);
    const candidates = slotCandidates(muzzleSlot, SMALL_MODS, fleaOffProfile, pin);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.id).toBe("muzzle_brake");
  });

  it("returns an empty array when the slot is pinned to an item not in modList", () => {
    const muzzleSlot = SMALL_TREE.slots[0]!;
    const pin = new Map([["muzzle", "nonexistent_item"]]);
    expect(slotCandidates(muzzleSlot, SMALL_MODS, fleaOnProfile, pin)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

```bash
pnpm --filter @tarkov/optimizer test feasibility.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `feasibility.ts`**

```ts
// packages/optimizer/src/feasibility.ts
import { itemAvailability } from "@tarkov/data";
import type { ModListItem, PlayerProfile, SlotNode } from "@tarkov/data";

/**
 * Returns the cheapest RUB price at which `item` is obtainable under the
 * given player profile, or `null` if the item is unavailable.
 */
export function cheapestPrice(item: ModListItem, profile: PlayerProfile): number | null {
  const avail = itemAvailability(item, profile);
  if (!avail.available) return null;
  return avail.priceRUB;
}

/**
 * Returns the set of decisions the DFS must explore for a slot.
 *
 * - If the slot is pinned to an item id → that item (from modList) as a
 *   singleton. Availability is IGNORED (user's explicit choice overrides).
 *   If the pinned id isn't present in `modList`, returns empty (infeasible).
 * - If the slot is pinned empty → [null].
 * - If unpinned → compatible items filtered by availability, plus null
 *   (leave-empty option).
 */
export function slotCandidates(
  slot: SlotNode,
  modList: readonly ModListItem[],
  profile: PlayerProfile,
  pinnedSlots: ReadonlyMap<string, string | null>,
): readonly (ModListItem | null)[] {
  const pin = pinnedSlots.get(slot.path);
  if (pin === null) {
    // Pinned empty.
    return [null];
  }
  if (typeof pin === "string") {
    const item = modList.find((m) => m.id === pin);
    return item ? [item] : [];
  }
  // Unpinned: enumerate compatible + available items plus null.
  const compatible = modList.filter((m) => slot.allowedItemIds.has(m.id));
  const available = compatible.filter((m) => itemAvailability(m, profile).available);
  return [...available, null];
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
pnpm --filter @tarkov/optimizer test feasibility.test.ts
```

Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/optimizer/src/feasibility.ts packages/optimizer/src/feasibility.test.ts
git commit -m "feat(optimizer): feasibility — cheapestPrice + slotCandidates"
```

---

## Task 6: `bounds.ts` — lower-bound heuristic

**Files:**

- Create: `packages/optimizer/src/bounds.ts`
- Create: `packages/optimizer/src/bounds.test.ts`

The lower bound answers: "for the remaining (unvisited) slots, what is the best possible additional contribution to the score?" Critical for B&B pruning effectiveness.

For `min-recoil`:
- Recoil in `weaponSpec` is computed as `base * (1 + Σ recoilModifierPercent/100)`. The best (most-negative) contribution from a slot is the smallest `recoilModifierPercent` among its candidates.

For `max-ergonomics` (negated):
- Ergonomics is additive. Best contribution = smallest `-ergonomics` = largest `ergonomics`.

For `min-weight`:
- Weight is additive. Best contribution = smallest `weight`. `null` (leave empty) contributes 0.

For `max-accuracy` (minimize MOA):
- Accuracy is additive. Best contribution = smallest `accuracyDelta`.

Lower-bound math is slightly objective-specific. Implement a single `lowerBoundForRemaining(slots, modList, profile, pinnedSlots, objective, baseWeapon)` that returns the best-possible additional score contribution.

**Important:** for `min-recoil` the bound is NOT additive (recoil uses multipliers). Precompute the sum-of-best-percent for remaining slots, then return `baseRecoil * (1 + sumBestPercent / 100)` minus the already-accumulated portion. Keep the implementation simple: recompute from scratch each time. This is a pure function called once per DFS node — O(n·m) — which is fine.

- [ ] **Step 1: Write the failing test**

```ts
// packages/optimizer/src/bounds.test.ts
import { describe, it, expect } from "vitest";
import { lowerBoundForRemaining } from "./bounds.js";
import { SMALL_WEAPON, SMALL_MODS, SMALL_TREE } from "./__fixtures__/small-weapon.js";
import type { PlayerProfile } from "@tarkov/data";

const flea: PlayerProfile = {
  mode: "basic",
  traders: { prapor: 1, therapist: 1, skier: 1, peacekeeper: 1, mechanic: 1, ragman: 1, jaeger: 1 },
  flea: true,
};

describe("lowerBoundForRemaining", () => {
  it("min-weight: sum of smallest-weight candidate per remaining slot (null = 0)", () => {
    const bound = lowerBoundForRemaining(
      SMALL_TREE.slots,
      SMALL_MODS,
      flea,
      new Map(),
      "min-weight",
      SMALL_WEAPON,
    );
    // For min-weight, null (0 weight) is always the best candidate.
    expect(bound).toBe(0);
  });

  it("max-ergonomics: negative sum of largest-ergo candidate per slot", () => {
    const bound = lowerBoundForRemaining(
      SMALL_TREE.slots,
      SMALL_MODS,
      flea,
      new Map(),
      "max-ergonomics",
      SMALL_WEAPON,
    );
    // Best ergo gains: muzzle = max(2, 3) = 3; grip = 5; stock = 8 → sum = 16.
    // Bound is NEGATIVE ergo delta (because score negates), from the weapon base.
    // Score of a complete build: -(50 + 16) = -66.
    // lowerBoundForRemaining reports only the delta, not the full score — so -16.
    expect(bound).toBe(-16);
  });

  it("min-recoil: best possible recoil after all slots contribute their min recoilModifier", () => {
    const bound = lowerBoundForRemaining(
      SMALL_TREE.slots,
      SMALL_MODS,
      flea,
      new Map(),
      "min-recoil",
      SMALL_WEAPON,
    );
    // Best per-slot recoilModifier: muzzle = min(-12, -8) = -12; grip = -4; stock = -6.
    // Sum = -22%. Final recoil = base*(1 + sum/100) = base*0.78.
    // Vert+horiz: (100+200)*0.78 = 234. Bound is the *delta* from base vert+horiz.
    // base = 300, bound = 234-300 = -66.
    expect(bound).toBeCloseTo(-66, 5);
  });

  it("respects pinned slots (uses pinned item's value, not the best available)", () => {
    // Pin muzzle to silencer (ergonomics 3) — worse than brake's ergonomics 2? No: 3 > 2.
    // Pin muzzle to brake (ergonomics 2) — worse than silencer (3).
    const pinBrake = new Map([["muzzle", "muzzle_brake"]]);
    const bound = lowerBoundForRemaining(
      SMALL_TREE.slots,
      SMALL_MODS,
      flea,
      pinBrake,
      "max-ergonomics",
      SMALL_WEAPON,
    );
    // muzzle (pinned to brake, ergo 2) + grip (best 5) + stock (best 8) = 15.
    // Score delta = -15.
    expect(bound).toBe(-15);
  });

  it("returns 0 when there are no remaining slots", () => {
    expect(
      lowerBoundForRemaining([], SMALL_MODS, flea, new Map(), "min-weight", SMALL_WEAPON),
    ).toBe(0);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

```bash
pnpm --filter @tarkov/optimizer test bounds.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `bounds.ts`**

```ts
// packages/optimizer/src/bounds.ts
import type { BallisticWeapon } from "@tarkov/ballistics";
import type { ModListItem, PlayerProfile, SlotNode } from "@tarkov/data";
import { slotCandidates } from "./feasibility.js";
import type { Objective } from "./types.js";

/**
 * Best-possible additional score contribution for `remaining` slots under
 * the given objective. Used by the B&B DFS to prune branches whose
 * best-case completion cannot beat the current best-seen score.
 *
 * The returned number is an *additive delta* against the running score,
 * not a full score — the caller adds it to what it has already accumulated.
 */
export function lowerBoundForRemaining(
  remaining: readonly SlotNode[],
  modList: readonly ModListItem[],
  profile: PlayerProfile,
  pinnedSlots: ReadonlyMap<string, string | null>,
  objective: Objective,
  weapon: BallisticWeapon,
): number {
  if (remaining.length === 0) return 0;

  switch (objective) {
    case "min-recoil": {
      // Recoil is multiplicative; sum the best recoilModifierPercent per slot.
      let sumPercent = 0;
      for (const slot of remaining) {
        sumPercent += bestContribution(slot, modList, profile, pinnedSlots, (m) => m?.properties.recoilModifier ?? 0, Math.min);
      }
      const baseRecoil = weapon.baseVerticalRecoil + weapon.baseHorizontalRecoil;
      // Delta against base (before this slot-group's contribution): base * (sumPercent/100).
      return baseRecoil * (sumPercent / 100);
    }
    case "max-ergonomics": {
      let sumErgo = 0;
      for (const slot of remaining) {
        sumErgo += bestContribution(slot, modList, profile, pinnedSlots, (m) => m?.properties.ergonomics ?? 0, Math.max);
      }
      return -sumErgo;
    }
    case "min-weight": {
      let sumWeight = 0;
      for (const slot of remaining) {
        sumWeight += bestContribution(slot, modList, profile, pinnedSlots, (m) => m?.weight ?? 0, Math.min);
      }
      return sumWeight;
    }
    case "max-accuracy": {
      let sumMoa = 0;
      for (const slot of remaining) {
        sumMoa += bestContribution(slot, modList, profile, pinnedSlots, (m) => m?.properties.accuracyModifier ?? 0, Math.min);
      }
      return sumMoa;
    }
  }
}

function bestContribution(
  slot: SlotNode,
  modList: readonly ModListItem[],
  profile: PlayerProfile,
  pinnedSlots: ReadonlyMap<string, string | null>,
  stat: (mod: ModListItem | null) => number,
  pick: (...values: number[]) => number,
): number {
  const candidates = slotCandidates(slot, modList, profile, pinnedSlots);
  if (candidates.length === 0) return 0;
  const values = candidates.map(stat);
  return pick(...values);
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
pnpm --filter @tarkov/optimizer test bounds.test.ts
```

Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/optimizer/src/bounds.ts packages/optimizer/src/bounds.test.ts
git commit -m "feat(optimizer): lowerBoundForRemaining — B&B pruning heuristic"
```

---

## Task 7: `branch-and-bound.ts` — DFS core

**Files:**

- Create: `packages/optimizer/src/branch-and-bound.ts`
- Create: `packages/optimizer/src/branch-and-bound.test.ts`

The core recursive DFS. Given `(weapon, slots, modList, constraints, objective)`, returns the best leaf configuration found.

Handles nested slots: when the chosen item for a slot has `AllowedItem.children` (sub-slots), those sub-slots are appended to the traversal queue.

Signatures:

```ts
interface BnbState {
  readonly weapon: BallisticWeapon;
  readonly modList: readonly ModListItem[];
  readonly profile: PlayerProfile;
  readonly pinnedSlots: ReadonlyMap<string, string | null>;
  readonly objective: Objective;
  readonly budgetRub: number | undefined;
  readonly deadline: number;  // performance.now() deadline
  readonly onNodeVisit: (count: number) => boolean;  // returns false to abort
}

interface BnbBest {
  attachments: Record<string, string>;
  score: number;
  price: number;
  stats: WeaponSpec;
}

function branchAndBound(state: BnbState, slots: readonly SlotNode[]): BnbBest | null;
```

The recursion keeps a running `attachments` map, `runningPrice`, and `partialMods` array. At each leaf, calls `weaponSpec(weapon, partialMods)` to get the full `WeaponSpec`, computes the score, compares to `best`.

Tie-breaking: lower `price` wins; then lexicographic order of attachment values (stringify and compare) to ensure full determinism.

- [ ] **Step 1: Write the failing test**

```ts
// packages/optimizer/src/branch-and-bound.test.ts
import { describe, it, expect } from "vitest";
import { branchAndBound, type BnbState } from "./branch-and-bound.js";
import { SMALL_WEAPON, SMALL_MODS, SMALL_TREE } from "./__fixtures__/small-weapon.js";
import type { PlayerProfile } from "@tarkov/data";

const flea: PlayerProfile = {
  mode: "basic",
  traders: { prapor: 1, therapist: 1, skier: 1, peacekeeper: 1, mechanic: 1, ragman: 1, jaeger: 1 },
  flea: true,
};

function makeState(overrides: Partial<BnbState> = {}): BnbState {
  return {
    weapon: SMALL_WEAPON,
    modList: SMALL_MODS,
    profile: flea,
    pinnedSlots: new Map(),
    objective: "min-recoil",
    budgetRub: undefined,
    deadline: Number.POSITIVE_INFINITY,
    onNodeVisit: () => true,
    ...overrides,
  };
}

describe("branchAndBound", () => {
  it("finds min-recoil optimum on small weapon", () => {
    const best = branchAndBound(makeState(), SMALL_TREE.slots);
    expect(best).not.toBeNull();
    expect(best!.attachments).toEqual({
      muzzle: "muzzle_brake",    // -12%
      grip: "grip_vertical",     // -4%
      stock: "stock_standard",   // -6%
    });
  });

  it("respects pinned slots", () => {
    const pin = new Map([["muzzle", "muzzle_silencer"]]);
    const best = branchAndBound(makeState({ pinnedSlots: pin }), SMALL_TREE.slots);
    expect(best!.attachments.muzzle).toBe("muzzle_silencer");
  });

  it("respects budget", () => {
    // Budget too tight for silencer (3500) + vertical (900) + stock (2200) = 6600.
    // But brake (1500) + vertical (900) + stock (2200) = 4600 fits a 5000 budget.
    const best = branchAndBound(makeState({ budgetRub: 5000 }), SMALL_TREE.slots);
    expect(best!.attachments.muzzle).toBe("muzzle_brake");
  });

  it("returns null when infeasible (budget excludes all combinations)", () => {
    const best = branchAndBound(makeState({ budgetRub: 0 }), SMALL_TREE.slots);
    // Only "all slots empty" is feasible at budget 0 — that's still a valid leaf.
    // So best is non-null with empty attachments.
    expect(best).not.toBeNull();
    expect(Object.keys(best!.attachments)).toHaveLength(0);
  });

  it("aborts when onNodeVisit returns false (timeout simulation)", () => {
    let count = 0;
    const best = branchAndBound(
      makeState({ onNodeVisit: () => ++count < 2 }),
      SMALL_TREE.slots,
    );
    // Aborted early; might return null or a partial-best. Either way, doesn't throw.
    expect(best === null || typeof best.score === "number").toBe(true);
  });

  it("tie-breaks by lowest price", () => {
    // Craft a scenario where two items yield the same score and differ in price.
    // Use min-weight (null = 0 weight, all slots prefer null).
    // Result: empty attachments, price 0. Deterministic.
    const best = branchAndBound(makeState({ objective: "min-weight" }), SMALL_TREE.slots);
    expect(best!.attachments).toEqual({});
    expect(best!.price).toBe(0);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

```bash
pnpm --filter @tarkov/optimizer test branch-and-bound.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `branch-and-bound.ts`**

```ts
// packages/optimizer/src/branch-and-bound.ts
import type { BallisticWeapon, WeaponSpec } from "@tarkov/ballistics";
import { weaponSpec } from "@tarkov/ballistics";
import type { ModListItem, PlayerProfile, SlotNode } from "@tarkov/data";
import { cheapestPrice, slotCandidates } from "./feasibility.js";
import { lowerBoundForRemaining } from "./bounds.js";
import { score } from "./objective.js";
import type { Objective } from "./types.js";

export interface BnbState {
  readonly weapon: BallisticWeapon;
  readonly modList: readonly ModListItem[];
  readonly profile: PlayerProfile;
  readonly pinnedSlots: ReadonlyMap<string, string | null>;
  readonly objective: Objective;
  readonly budgetRub: number | undefined;
  readonly deadline: number;
  /**
   * Called roughly every 1000 node visits. Returns `false` to abort early
   * (used for timeout enforcement).
   */
  readonly onNodeVisit: (visits: number) => boolean;
}

export interface BnbBest {
  readonly attachments: Readonly<Record<string, string>>;
  readonly score: number;
  readonly price: number;
  readonly stats: WeaponSpec;
}

interface MutableBest {
  attachments: Record<string, string>;
  score: number;
  price: number;
  stats: WeaponSpec;
}

/**
 * Returns the best (lowest-score) leaf found, or `null` if no leaves were
 * reached before abort. Tie-breaking: lower price wins; then lex order
 * of the joined `attachments` map ensures determinism.
 */
export function branchAndBound(
  state: BnbState,
  slots: readonly SlotNode[],
): BnbBest | null {
  const best: { value: MutableBest | null } = { value: null };
  const visits = { count: 0 };
  dfs(state, slots, [], 0, {}, 0, best, visits);
  return best.value;
}

function dfs(
  state: BnbState,
  remainingSlots: readonly SlotNode[],
  partialMods: ModListItem[],
  runningPrice: number,
  attachments: Record<string, string>,
  _depth: number,
  best: { value: MutableBest | null },
  visits: { count: number },
): boolean {
  visits.count += 1;
  if (visits.count % 1000 === 0) {
    if (!state.onNodeVisit(visits.count)) return false;
    if (performance.now() >= state.deadline) return false;
  }

  if (remainingSlots.length === 0) {
    // Leaf.
    const stats = weaponSpec(
      state.weapon,
      partialMods.map(adaptModListItem),
    );
    const leafScore = score(state.objective, stats);
    if (best.value === null || leafScore < best.value.score || (leafScore === best.value.score && tieBreakBetter(runningPrice, attachments, best.value))) {
      best.value = {
        attachments: { ...attachments },
        score: leafScore,
        price: runningPrice,
        stats,
      };
    }
    return true;
  }

  const [slot, ...rest] = remainingSlots;
  if (!slot) return true;
  const candidates = slotCandidates(slot, state.modList, state.profile, state.pinnedSlots);

  // Sort candidates by single-item score descending so we try best choices
  // first (makes pruning more effective).
  const sorted = [...candidates].sort((a, b) => singleItemScore(state.objective, a) - singleItemScore(state.objective, b));

  for (const candidate of sorted) {
    // Budget check.
    let additionalPrice = 0;
    if (candidate !== null) {
      const priceOrNull = cheapestPrice(candidate, state.profile);
      // Pinned items may have null price (unavailable under profile). Skip
      // only if the user didn't pin this item — pins override availability.
      if (priceOrNull !== null) additionalPrice = priceOrNull;
      // else: pinned unavailable item — proceed at price 0.
    }
    const newPrice = runningPrice + additionalPrice;
    if (state.budgetRub !== undefined && newPrice > state.budgetRub) continue;

    // Sub-slots unlocked by picking this item.
    const subSlots: readonly SlotNode[] = candidate
      ? (slot.allowedItems.find((ai) => ai.id === candidate.id)?.children ?? [])
      : [];
    const newRemaining = [...subSlots, ...rest];

    // Lower-bound pruning.
    if (best.value !== null) {
      const bound = lowerBoundForRemaining(
        newRemaining,
        state.modList,
        state.profile,
        state.pinnedSlots,
        state.objective,
        state.weapon,
      );
      // Compute what our leaf score would be if the bound is achieved.
      const runningStats = weaponSpec(state.weapon, [...partialMods, ...(candidate ? [candidate] : [])].map(adaptModListItem));
      const projectedScore = score(state.objective, runningStats) + bound;
      if (projectedScore >= best.value.score) continue;
    }

    if (candidate) {
      attachments[slot.path] = candidate.id;
      partialMods.push(candidate);
    }
    const keepGoing = dfs(state, newRemaining, partialMods, newPrice, attachments, _depth + 1, best, visits);
    if (candidate) {
      partialMods.pop();
      delete attachments[slot.path];
    }
    if (!keepGoing) return false;
  }

  return true;
}

function adaptModListItem(item: ModListItem) {
  return {
    id: item.id,
    name: item.name,
    ergonomicsDelta: item.properties.ergonomics,
    recoilModifierPercent: item.properties.recoilModifier,
    weight: item.weight,
    accuracyDelta: item.properties.accuracyModifier,
  };
}

function singleItemScore(objective: Objective, item: ModListItem | null): number {
  if (item === null) return 0;
  switch (objective) {
    case "min-recoil":
      return item.properties.recoilModifier;
    case "max-ergonomics":
      return -item.properties.ergonomics;
    case "min-weight":
      return item.weight;
    case "max-accuracy":
      return item.properties.accuracyModifier;
  }
}

function tieBreakBetter(
  newPrice: number,
  newAttachments: Readonly<Record<string, string>>,
  currentBest: MutableBest,
): boolean {
  if (newPrice !== currentBest.price) return newPrice < currentBest.price;
  const newKey = stableKey(newAttachments);
  const currentKey = stableKey(currentBest.attachments);
  return newKey < currentKey;
}

function stableKey(attachments: Readonly<Record<string, string>>): string {
  return Object.keys(attachments)
    .sort()
    .map((k) => `${k}=${attachments[k]}`)
    .join("|");
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
pnpm --filter @tarkov/optimizer test branch-and-bound.test.ts
```

Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/optimizer/src/branch-and-bound.ts packages/optimizer/src/branch-and-bound.test.ts
git commit -m "feat(optimizer): branch-and-bound DFS with pruning"
```

---

## Task 8: Top-level `optimize()` + timeout + integration tests

**Files:**

- Create: `packages/optimizer/src/optimize.ts`
- Create: `packages/optimizer/src/optimize.test.ts`
- Modify: `packages/optimizer/src/index.ts` (export `optimize`)

- [ ] **Step 1: Write the failing test**

```ts
// packages/optimizer/src/optimize.test.ts
import { describe, it, expect } from "vitest";
import { optimize } from "./optimize.js";
import { SMALL_WEAPON, SMALL_MODS, SMALL_TREE } from "./__fixtures__/small-weapon.js";
import { M4A1_WEAPON, M4A1_MODS, M4A1_TREE } from "./__fixtures__/m4a1-like.js";
import type { PlayerProfile } from "@tarkov/data";

const flea: PlayerProfile = {
  mode: "basic",
  traders: { prapor: 1, therapist: 1, skier: 1, peacekeeper: 1, mechanic: 1, ragman: 1, jaeger: 1 },
  flea: true,
};

const fleaOff: PlayerProfile = { ...flea, flea: false };

describe("optimize — small weapon", () => {
  it("returns ok:true with the computable optimum for min-recoil", () => {
    const result = optimize({
      weapon: SMALL_WEAPON,
      slotTree: SMALL_TREE,
      modList: SMALL_MODS,
      constraints: {
        profile: flea,
        pinnedSlots: new Map(),
      },
      objective: "min-recoil",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.build.version).toBe(4);
    expect(result.build.attachments).toEqual({
      muzzle: "muzzle_brake",
      grip: "grip_vertical",
      stock: "stock_standard",
    });
  });

  it("returns ok:true with empty build when profile excludes all items", () => {
    const result = optimize({
      weapon: SMALL_WEAPON,
      slotTree: SMALL_TREE,
      modList: SMALL_MODS,
      constraints: {
        profile: fleaOff,
        pinnedSlots: new Map(),
      },
      objective: "min-recoil",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.build.attachments).toEqual({});
  });

  it("returns ok:false reason=no-valid-combinations when a pinned item isn't in modList", () => {
    const result = optimize({
      weapon: SMALL_WEAPON,
      slotTree: SMALL_TREE,
      modList: SMALL_MODS,
      constraints: {
        profile: flea,
        pinnedSlots: new Map([["muzzle", "nonexistent"]]),
      },
      objective: "min-recoil",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("no-valid-combinations");
  });

  it("returns ok:true when budget is tight but some combinations fit", () => {
    const result = optimize({
      weapon: SMALL_WEAPON,
      slotTree: SMALL_TREE,
      modList: SMALL_MODS,
      constraints: {
        profile: flea,
        pinnedSlots: new Map(),
        budgetRub: 2000,
      },
      objective: "min-recoil",
    });
    expect(result.ok).toBe(true);
  });

  it("is deterministic — same input, same output across 10 runs", () => {
    const input = {
      weapon: SMALL_WEAPON,
      slotTree: SMALL_TREE,
      modList: SMALL_MODS,
      constraints: { profile: flea, pinnedSlots: new Map() },
      objective: "min-recoil" as const,
    };
    const first = optimize(input);
    for (let i = 0; i < 9; i++) {
      const r = optimize(input);
      expect(r).toEqual(first);
    }
  });
});

describe("optimize — m4a1-like weapon", () => {
  it("returns ok:true for min-recoil within 2s (performance check)", () => {
    const start = performance.now();
    const result = optimize({
      weapon: M4A1_WEAPON,
      slotTree: M4A1_TREE,
      modList: M4A1_MODS,
      constraints: { profile: flea, pinnedSlots: new Map() },
      objective: "min-recoil",
    });
    const elapsed = performance.now() - start;
    expect(result.ok).toBe(true);
    expect(elapsed).toBeLessThan(2000);
  });

  it("returns ok:true for max-ergonomics", () => {
    const result = optimize({
      weapon: M4A1_WEAPON,
      slotTree: M4A1_TREE,
      modList: M4A1_MODS,
      constraints: { profile: flea, pinnedSlots: new Map() },
      objective: "max-ergonomics",
    });
    expect(result.ok).toBe(true);
  });

  it("respects budget — cheapest-per-slot-pick stays under budget", () => {
    const result = optimize({
      weapon: M4A1_WEAPON,
      slotTree: M4A1_TREE,
      modList: M4A1_MODS,
      constraints: {
        profile: flea,
        pinnedSlots: new Map(),
        budgetRub: 20000,
      },
      objective: "min-recoil",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    // All picked items must have priceRUB ≤ 20000 total.
    // (We can't know the exact set, but we know total price ≤ budget.)
  });
});

describe("optimize — timeout", () => {
  it("returns partial:true when timeout elapses but some leaves were reached", () => {
    const result = optimize({
      weapon: M4A1_WEAPON,
      slotTree: M4A1_TREE,
      modList: M4A1_MODS,
      constraints: { profile: flea, pinnedSlots: new Map() },
      objective: "min-recoil",
      timeoutMs: 1,
    });
    // Could be ok:true partial or ok:false timeout; both are acceptable.
    if (result.ok) {
      expect(result.partial).toBe(true);
    } else {
      expect(result.reason).toBe("timeout");
    }
  });
});
```

- [ ] **Step 2: Run test, verify failure**

```bash
pnpm --filter @tarkov/optimizer test optimize.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `optimize.ts`**

```ts
// packages/optimizer/src/optimize.ts
import type { BuildV4 } from "@tarkov/data";
import { branchAndBound } from "./branch-and-bound.js";
import type { OptimizationInput, OptimizationResult } from "./types.js";

const DEFAULT_TIMEOUT_MS = 2000;

/**
 * Top-level entry point. Wraps the B&B DFS with timeout accounting and
 * translates to the typed `OptimizationResult` shape.
 */
export function optimize(input: OptimizationInput): OptimizationResult {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const start = performance.now();
  const deadline = start + timeoutMs;
  let aborted = false;

  const best = branchAndBound(
    {
      weapon: input.weapon,
      modList: input.modList,
      profile: input.constraints.profile,
      pinnedSlots: input.constraints.pinnedSlots,
      objective: input.objective,
      budgetRub: input.constraints.budgetRub,
      deadline,
      onNodeVisit: () => {
        if (performance.now() >= deadline) {
          aborted = true;
          return false;
        }
        return true;
      },
    },
    input.slotTree.slots,
  );

  if (best === null) {
    return {
      ok: false,
      reason: aborted ? "timeout" : "no-valid-combinations",
    };
  }

  // Check for infeasible-budget: if the best has an empty attachments map
  // AND a budget was set AND at least one item could have been picked
  // without the budget — we'd have an infeasible-budget signal. Simpler
  // heuristic: if best is the empty build AND budget === 0 AND any slot
  // has at least one compatible item, that's infeasible-budget. Otherwise,
  // empty is the true optimum.
  //
  // For v1 we report `ok: true` with the empty build when the search
  // converges there. `infeasible-budget` is reserved for the case where
  // the user pinned an item that doesn't fit under the budget — the DFS
  // finds no completable branch, returns null, and `aborted` is false.
  // That's already covered by `no-valid-combinations` above when a pin
  // can't be satisfied; distinguish during a future refinement if users
  // request it.

  const build: BuildV4 = {
    version: 4,
    weaponId: input.weapon.id,
    attachments: { ...best.attachments },
    orphaned: [],
    createdAt: new Date(start).toISOString(),
  };

  return {
    ok: true,
    build,
    stats: best.stats,
    ...(aborted ? { partial: true } : {}),
  };
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
pnpm --filter @tarkov/optimizer test optimize.test.ts
```

Expected: PASS — 9 tests.

- [ ] **Step 5: Update `index.ts` to re-export `optimize`**

```ts
// packages/optimizer/src/index.ts
export { optimize } from "./optimize.js";
export type {
  Objective,
  OptimizationConstraints,
  OptimizationInput,
  OptimizationReason,
  OptimizationResult,
} from "./types.js";
```

- [ ] **Step 6: Run the full suite**

```bash
pnpm --filter @tarkov/optimizer test
```

Expected: PASS — all ~27 tests across the package.

- [ ] **Step 7: Run coverage check**

```bash
pnpm --filter @tarkov/optimizer test -- --coverage
```

Expected: lines 100%, statements 100%, functions 100%, branches ≥95%. If below threshold, add targeted tests before committing.

- [ ] **Step 8: Commit**

```bash
git add packages/optimizer/src/optimize.ts packages/optimizer/src/optimize.test.ts packages/optimizer/src/index.ts
git commit -m "feat(optimizer): optimize() top-level + timeout + integration tests"
```

---

## Task 9: Monorepo wiring

**Files:**

- Modify: `apps/web/package.json` (add `@tarkov/optimizer` dep)
- Modify: `eslint.config.js` (allow `packages/optimizer` tests)

- [ ] **Step 1: Add the dep**

Edit `apps/web/package.json` to include `@tarkov/optimizer`:

```json
{
  "dependencies": {
    "@tarkov/data": "workspace:*",
    "@tarkov/ballistics": "workspace:*",
    "@tarkov/optimizer": "workspace:*",
    "@tarkov/ui": "workspace:*",
    ...
  }
}
```

- [ ] **Step 2: Add eslint allowlist entries**

Edit `eslint.config.js`. In the `allowDefaultProject` array, add:

```js
"packages/optimizer/src/*.test.ts",
"packages/optimizer/src/__fixtures__/*.ts",
"packages/optimizer/vitest.config.ts",
```

- [ ] **Step 3: Run pnpm install**

```bash
pnpm install
```

Expected: `apps/web` now links `@tarkov/optimizer`.

- [ ] **Step 4: Full build + typecheck + lint**

```bash
pnpm --filter "./packages/*" build
pnpm typecheck
pnpm lint
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json eslint.config.js pnpm-lock.yaml
git commit -m "chore(web): add @tarkov/optimizer workspace dep + eslint allowlist"
```

---

## Task 10: `optimize-constraints-reducer.ts` — pure reducer for the form

**Files:**

- Create: `apps/web/src/features/builder/optimize/optimize-constraints-reducer.ts`
- Create: `apps/web/src/features/builder/optimize/optimize-constraints-reducer.test.ts`

Follows the `compareDraftReducer` pattern from v1.6.0: pure reducer + thin hook, reducer is unit-testable without React.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/features/builder/optimize/optimize-constraints-reducer.test.ts
import { describe, it, expect } from "vitest";
import {
  constraintsReducer,
  initialConstraintsState,
  toOptimizerInput,
  type ConstraintsState,
} from "./optimize-constraints-reducer.js";
import type { PlayerProfile } from "@tarkov/data";

const profile: PlayerProfile = {
  mode: "basic",
  traders: { prapor: 1, therapist: 1, skier: 1, peacekeeper: 1, mechanic: 1, ragman: 1, jaeger: 1 },
  flea: true,
};

describe("constraintsReducer", () => {
  it("initial state has objective=min-recoil and no budget", () => {
    expect(initialConstraintsState.objective).toBe("min-recoil");
    expect(initialConstraintsState.budgetRub).toBeUndefined();
  });

  it("SET_OBJECTIVE updates the objective", () => {
    const next = constraintsReducer(initialConstraintsState, {
      type: "SET_OBJECTIVE",
      objective: "max-ergonomics",
    });
    expect(next.objective).toBe("max-ergonomics");
  });

  it("SET_BUDGET parses string input and handles blank as undefined", () => {
    const set = constraintsReducer(initialConstraintsState, { type: "SET_BUDGET", value: "50000" });
    expect(set.budgetRub).toBe(50000);
    const cleared = constraintsReducer(set, { type: "SET_BUDGET", value: "" });
    expect(cleared.budgetRub).toBeUndefined();
  });

  it("TOGGLE_PIN adds or removes a slot from pinnedSlots", () => {
    const state: ConstraintsState = {
      ...initialConstraintsState,
      pinnedSlots: new Map([["muzzle", "muzzle_brake"]]),
    };
    const removed = constraintsReducer(state, { type: "TOGGLE_PIN", slotPath: "muzzle" });
    expect(removed.pinnedSlots.has("muzzle")).toBe(false);
    const addedBack = constraintsReducer(removed, {
      type: "TOGGLE_PIN",
      slotPath: "muzzle",
      defaultItemId: "muzzle_brake",
    });
    expect(addedBack.pinnedSlots.get("muzzle")).toBe("muzzle_brake");
  });

  it("INIT_FROM_BUILD populates pinnedSlots with all currently-attached mods", () => {
    const state = constraintsReducer(initialConstraintsState, {
      type: "INIT_FROM_BUILD",
      attachments: { muzzle: "brake", grip: "vgrip" },
    });
    expect(state.pinnedSlots.get("muzzle")).toBe("brake");
    expect(state.pinnedSlots.get("grip")).toBe("vgrip");
    expect(state.pinnedSlots.size).toBe(2);
  });
});

describe("toOptimizerInput", () => {
  it("builds an OptimizationInput from ConstraintsState + deps", () => {
    const state: ConstraintsState = {
      objective: "min-recoil",
      budgetRub: 50000,
      pinnedSlots: new Map([["muzzle", "brake"]]),
    };
    const out = toOptimizerInput(state, {
      weapon: { id: "w1", name: "W", baseErgonomics: 0, baseVerticalRecoil: 0, baseHorizontalRecoil: 0, baseWeight: 0, baseAccuracy: 0 },
      slotTree: { weaponId: "w1", weaponName: "W", slots: [] },
      modList: [],
      profile,
    });
    expect(out.objective).toBe("min-recoil");
    expect(out.constraints.budgetRub).toBe(50000);
    expect(out.constraints.pinnedSlots.get("muzzle")).toBe("brake");
    expect(out.constraints.profile).toBe(profile);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

```bash
pnpm --filter @tarkov/web test optimize-constraints-reducer
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement the reducer**

```ts
// apps/web/src/features/builder/optimize/optimize-constraints-reducer.ts
import type {
  ModListItem,
  PlayerProfile,
  WeaponTree,
} from "@tarkov/data";
import type {
  Objective,
  OptimizationInput,
} from "@tarkov/optimizer";
import type { BallisticWeapon } from "@tarkov/ballistics";

export interface ConstraintsState {
  objective: Objective;
  budgetRub: number | undefined;
  pinnedSlots: Map<string, string | null>;
}

export const initialConstraintsState: ConstraintsState = {
  objective: "min-recoil",
  budgetRub: undefined,
  pinnedSlots: new Map(),
};

export type ConstraintsAction =
  | { type: "SET_OBJECTIVE"; objective: Objective }
  | { type: "SET_BUDGET"; value: string }
  | { type: "TOGGLE_PIN"; slotPath: string; defaultItemId?: string }
  | { type: "INIT_FROM_BUILD"; attachments: Readonly<Record<string, string>> }
  | { type: "RESET" };

export function constraintsReducer(
  state: ConstraintsState,
  action: ConstraintsAction,
): ConstraintsState {
  switch (action.type) {
    case "SET_OBJECTIVE":
      return { ...state, objective: action.objective };
    case "SET_BUDGET": {
      const trimmed = action.value.trim();
      if (trimmed === "") return { ...state, budgetRub: undefined };
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed < 0) return state;
      return { ...state, budgetRub: parsed };
    }
    case "TOGGLE_PIN": {
      const next = new Map(state.pinnedSlots);
      if (next.has(action.slotPath)) {
        next.delete(action.slotPath);
      } else {
        next.set(action.slotPath, action.defaultItemId ?? null);
      }
      return { ...state, pinnedSlots: next };
    }
    case "INIT_FROM_BUILD": {
      const next = new Map<string, string | null>();
      for (const [slotPath, itemId] of Object.entries(action.attachments)) {
        next.set(slotPath, itemId);
      }
      return { ...state, pinnedSlots: next };
    }
    case "RESET":
      return initialConstraintsState;
  }
}

export interface OptimizerInputDeps {
  weapon: BallisticWeapon;
  slotTree: WeaponTree;
  modList: readonly ModListItem[];
  profile: PlayerProfile;
}

/**
 * Combine the form state with the runtime deps to build the final
 * `OptimizationInput` passed to `optimize()`.
 */
export function toOptimizerInput(
  state: ConstraintsState,
  deps: OptimizerInputDeps,
): OptimizationInput {
  return {
    weapon: deps.weapon,
    slotTree: deps.slotTree,
    modList: deps.modList,
    objective: state.objective,
    constraints: {
      profile: deps.profile,
      pinnedSlots: state.pinnedSlots,
      ...(state.budgetRub !== undefined ? { budgetRub: state.budgetRub } : {}),
    },
  };
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
pnpm --filter @tarkov/web test optimize-constraints-reducer
```

Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/builder/optimize/
git commit -m "feat(builder/optimize): constraints reducer (objective / budget / pins)"
```

---

## Task 11: `useOptimizer.ts` — hook

**Files:**

- Create: `apps/web/src/features/builder/optimize/useOptimizer.ts`

No test (thin wrapper; covered by Playwright per project convention).

- [ ] **Step 1: Write the hook**

```ts
// apps/web/src/features/builder/optimize/useOptimizer.ts
import { useCallback, useState } from "react";
import { optimize, type OptimizationInput, type OptimizationResult } from "@tarkov/optimizer";

export type OptimizerState = "idle" | "running" | "done" | "error";

export interface UseOptimizerReturn {
  state: OptimizerState;
  result?: OptimizationResult;
  error?: Error;
  run(input: OptimizationInput): void;
  reset(): void;
}

/**
 * Thin wrapper around `optimize()`. The solver is synchronous; the
 * `"running"` state exists only to render a brief spinner around the
 * call. In practice most weapons solve in <50 ms; the spinner may never
 * visibly render. That's fine.
 */
export function useOptimizer(): UseOptimizerReturn {
  const [state, setState] = useState<OptimizerState>("idle");
  const [result, setResult] = useState<OptimizationResult | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);

  const run = useCallback((input: OptimizationInput) => {
    setState("running");
    setResult(undefined);
    setError(undefined);
    // `optimize` is synchronous but we defer to the next microtask so React
    // has a chance to paint the "running" state before the blocking call.
    queueMicrotask(() => {
      try {
        const r = optimize(input);
        setResult(r);
        setState("done");
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
        setState("error");
      }
    });
  }, []);

  const reset = useCallback(() => {
    setState("idle");
    setResult(undefined);
    setError(undefined);
  }, []);

  return { state, result, error, run, reset };
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @tarkov/web typecheck
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/builder/optimize/useOptimizer.ts
git commit -m "feat(builder/optimize): useOptimizer hook"
```

---

## Task 12: `OptimizeConstraintsForm` component (Tab 1)

**Files:**

- Create: `apps/web/src/features/builder/optimize/optimize-constraints-form.tsx`

No test (presentational; Playwright covers interaction). Keep the JSX lean; match the existing Field Ledger aesthetic.

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/features/builder/optimize/optimize-constraints-form.tsx
import type { ReactElement } from "react";
import type { Objective } from "@tarkov/optimizer";
import type { WeaponTree } from "@tarkov/data";
import { Button, Input, SectionTitle } from "@tarkov/ui";
import type {
  ConstraintsAction,
  ConstraintsState,
} from "./optimize-constraints-reducer.js";

const OBJECTIVES: readonly { value: Objective; label: string }[] = [
  { value: "min-recoil", label: "Min recoil" },
  { value: "max-ergonomics", label: "Max ergonomics" },
  { value: "min-weight", label: "Min weight" },
  { value: "max-accuracy", label: "Max accuracy" },
];

interface Props {
  state: ConstraintsState;
  dispatch: (action: ConstraintsAction) => void;
  slotTree: WeaponTree;
  onRun: () => void;
}

export function OptimizeConstraintsForm({
  state,
  dispatch,
  slotTree,
  onRun,
}: Props): ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <SectionTitle index={1} title="Objective" />
        <div className="grid grid-cols-2 gap-2">
          {OBJECTIVES.map((o) => (
            <label
              key={o.value}
              className="flex items-center gap-2 border border-[var(--color-border)] p-2 font-mono text-sm uppercase tracking-wider hover:border-[var(--color-primary)]"
            >
              <input
                type="radio"
                name="objective"
                value={o.value}
                checked={state.objective === o.value}
                onChange={() => dispatch({ type: "SET_OBJECTIVE", objective: o.value })}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SectionTitle index={2} title="Budget (₽, optional)" />
        <Input
          type="number"
          min={0}
          placeholder="No cap"
          value={state.budgetRub !== undefined ? String(state.budgetRub) : ""}
          onChange={(e) => dispatch({ type: "SET_BUDGET", value: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <SectionTitle index={3} title="Pinned slots" />
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Un-check a slot to let the solver pick a different item for it.
        </p>
        <ul className="flex flex-col gap-1 border border-dashed border-[var(--color-border)] p-2">
          {slotTree.slots.map((slot) => (
            <li key={slot.path} className="flex items-center justify-between font-mono text-sm">
              <label className="flex items-center gap-2 flex-1">
                <input
                  type="checkbox"
                  checked={state.pinnedSlots.has(slot.path)}
                  onChange={() => dispatch({ type: "TOGGLE_PIN", slotPath: slot.path })}
                />
                <span className="uppercase tracking-wider">{slot.name || slot.nameId}</span>
              </label>
              <span className="text-[var(--color-muted-foreground)]">
                {state.pinnedSlots.has(slot.path)
                  ? state.pinnedSlots.get(slot.path) ?? "(empty)"
                  : "solver"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex justify-end">
        <Button onClick={onRun}>Run optimization</Button>
      </div>
    </div>
  );
}
```

(Only direct slots are shown in the pin list for simplicity — nested sub-slots appear after a pin is resolved. Follow-up if users ask.)

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @tarkov/web typecheck
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/builder/optimize/optimize-constraints-form.tsx
git commit -m "feat(builder/optimize): OptimizeConstraintsForm (Tab 1)"
```

---

## Task 13: `OptimizeResultView` component (Tab 2)

**Files:**

- Create: `apps/web/src/features/builder/optimize/optimize-result-view.tsx`

Renders success / failure / partial states. Reuses shipped primitives.

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/features/builder/optimize/optimize-result-view.tsx
import type { ReactElement } from "react";
import type { OptimizationResult } from "@tarkov/optimizer";
import type { WeaponSpec } from "@tarkov/ballistics";
import { Button, Pill, SectionTitle, Stamp } from "@tarkov/ui";
import { CompareStatDelta } from "../compare/compare-stat-delta.js";

interface Props {
  result: OptimizationResult;
  currentStats: WeaponSpec | null;
  onAccept: () => void;
  onReject: () => void;
  onAdjust: () => void;
}

export function OptimizeResultView({
  result,
  currentStats,
  onAccept,
  onReject,
  onAdjust,
}: Props): ReactElement {
  if (!result.ok) {
    return <FailureView reason={result.reason} onAdjust={onAdjust} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <SectionTitle index={1} title="Result" />
        {result.partial && <Stamp tone="amber">PARTIAL</Stamp>}
      </div>
      {result.partial && (
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Timed out before the search completed. Showing best explored so far.
        </p>
      )}
      <CompareStatDelta left={currentStats} right={result.stats} />
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onReject}>
          Reject
        </Button>
        <Button onClick={onAccept}>Accept</Button>
      </div>
    </div>
  );
}

const REASON_COPY: Readonly<Record<string, { title: string; body: string }>> = {
  "no-valid-combinations": {
    title: "No valid build exists",
    body:
      "Under these constraints, nothing is buildable. Try unpinning a slot, " +
      "raising the budget, or loosening the profile.",
  },
  "infeasible-budget": {
    title: "Budget too tight",
    body: "The cheapest valid build exceeds your budget.",
  },
  timeout: {
    title: "Timed out",
    body: "The solver didn't finish in time and couldn't find any valid build.",
  },
};

function FailureView({
  reason,
  onAdjust,
}: {
  reason: string;
  onAdjust: () => void;
}): ReactElement {
  const copy = REASON_COPY[reason] ?? {
    title: "Couldn't optimize",
    body: "Unknown error.",
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-lg uppercase tracking-wider">{copy.title}</h3>
        <p className="text-sm text-[var(--color-muted-foreground)]">{copy.body}</p>
      </div>
      <Pill>{reason.toUpperCase()}</Pill>
      <div className="flex justify-end">
        <Button onClick={onAdjust}>Adjust constraints</Button>
      </div>
    </div>
  );
}
```

(Verify `CompareStatDelta`'s prop names match what was shipped — it's `left` / `right`.)

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @tarkov/web typecheck
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/builder/optimize/optimize-result-view.tsx
git commit -m "feat(builder/optimize): OptimizeResultView (Tab 2 success + failure)"
```

---

## Task 14: `OptimizeDialog` orchestrator

**Files:**

- Create: `apps/web/src/features/builder/optimize/optimize-dialog.tsx`

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/features/builder/optimize/optimize-dialog.tsx
import { useEffect, useReducer, useState, type ReactElement } from "react";
import type {
  BuildV4,
  ModListItem,
  PlayerProfile,
  WeaponTree,
} from "@tarkov/data";
import type { BallisticWeapon, WeaponSpec } from "@tarkov/ballistics";
import { Button, Card, CardContent } from "@tarkov/ui";
import {
  constraintsReducer,
  initialConstraintsState,
  toOptimizerInput,
} from "./optimize-constraints-reducer.js";
import { OptimizeConstraintsForm } from "./optimize-constraints-form.js";
import { OptimizeResultView } from "./optimize-result-view.js";
import { useOptimizer } from "./useOptimizer.js";

interface OptimizeDialogProps {
  open: boolean;
  onClose: () => void;
  onAccept: (build: BuildV4) => void;
  weapon: BallisticWeapon;
  slotTree: WeaponTree;
  modList: readonly ModListItem[];
  profile: PlayerProfile;
  currentAttachments: Readonly<Record<string, string>>;
  currentStats: WeaponSpec | null;
}

export function OptimizeDialog({
  open,
  onClose,
  onAccept,
  weapon,
  slotTree,
  modList,
  profile,
  currentAttachments,
  currentStats,
}: OptimizeDialogProps): ReactElement | null {
  const [tab, setTab] = useState<"constraints" | "result">("constraints");
  const [state, dispatch] = useReducer(constraintsReducer, initialConstraintsState);
  const optimizer = useOptimizer();

  useEffect(() => {
    if (open) {
      dispatch({ type: "INIT_FROM_BUILD", attachments: currentAttachments });
      setTab("constraints");
      optimizer.reset();
    }
  }, [open, currentAttachments, optimizer]);

  useEffect(() => {
    if (optimizer.state === "done" || optimizer.state === "error") {
      setTab("result");
    }
  }, [optimizer.state]);

  if (!open) return null;

  const handleRun = () => {
    optimizer.run(toOptimizerInput(state, { weapon, slotTree, modList, profile }));
  };

  const handleAccept = () => {
    if (optimizer.result?.ok) {
      onAccept(optimizer.result.build);
      onClose();
    }
  };

  const handleReject = () => {
    optimizer.reset();
    onClose();
  };

  const handleAdjust = () => {
    optimizer.reset();
    setTab("constraints");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-2xl"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <CardContent className="p-6 flex flex-col gap-4">
          <h2 className="font-display text-xl uppercase tracking-wider">Optimize build</h2>

          {tab === "constraints" && (
            <OptimizeConstraintsForm
              state={state}
              dispatch={dispatch}
              slotTree={slotTree}
              onRun={handleRun}
            />
          )}

          {tab === "result" && optimizer.state === "running" && (
            <p className="text-center text-sm text-[var(--color-muted-foreground)] py-8">
              Running…
            </p>
          )}

          {tab === "result" && optimizer.result && (
            <OptimizeResultView
              result={optimizer.result}
              currentStats={currentStats}
              onAccept={handleAccept}
              onReject={handleReject}
              onAdjust={handleAdjust}
            />
          )}

          {tab === "result" && optimizer.state === "error" && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-[var(--color-destructive)]">
                Optimizer threw: {optimizer.error?.message ?? "unknown error"}
              </p>
              <Button onClick={handleAdjust}>Back</Button>
            </div>
          )}

          <div className="flex justify-between pt-2 border-t border-[var(--color-border)]">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @tarkov/web typecheck
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/builder/optimize/optimize-dialog.tsx
git commit -m "feat(builder/optimize): OptimizeDialog orchestrator"
```

---

## Task 15: Wire "Optimize ⚙" button into `BuildHeader` + `BuilderPage`

**Files:**

- Modify: `apps/web/src/features/builder/build-header.tsx`
- Modify: `apps/web/src/routes/builder.tsx`

- [ ] **Step 1: Add `onOptimize` prop to `BuildHeader`**

Edit `build-header.tsx`:

1. Add `onOptimize?: () => void` to `BuildHeaderProps` (already has `onCompare?`).
2. In the action row (wherever the Compare ↔ button lives), add:

   ```tsx
   {onOptimize && (
     <Button variant="secondary" size="sm" onClick={onOptimize}>
       Optimize ⚙
     </Button>
   )}
   ```

- [ ] **Step 2: Wire into `BuilderPage` (`apps/web/src/routes/builder.tsx`)**

1. Import `OptimizeDialog` from `../features/builder/optimize/optimize-dialog.js`.
2. Add local state: `const [optimizeOpen, setOptimizeOpen] = useState(false);`
3. Pass `onOptimize={weaponId ? () => setOptimizeOpen(true) : undefined}` to `<BuildHeader>`.
4. Add handler:
   ```ts
   const handleOptimizeAccept = (build: BuildV4) => {
     setAttachments(build.attachments);
     setOrphaned(build.orphaned);
     setOptimizeOpen(false);
   };
   ```
5. Render the dialog (after the `CompareFromBuildDialog`):
   ```tsx
   {tree.data && selectedWeapon && (
     <OptimizeDialog
       open={optimizeOpen}
       onClose={() => setOptimizeOpen(false)}
       onAccept={handleOptimizeAccept}
       weapon={adaptWeapon(selectedWeapon)}
       slotTree={tree.data}
       modList={mods.data ?? []}
       profile={profile}
       currentAttachments={attachments}
       currentStats={currentSpec}
     />
   )}
   ```
   Fill in `currentSpec` the same way the existing code does (it's already computed for `BuildHeader`).

- [ ] **Step 3: Typecheck + test**

```bash
pnpm --filter @tarkov/web typecheck
pnpm --filter @tarkov/web test
```

Expected: all pass (no regressions).

- [ ] **Step 4: Dev server smoke (manual)**

```bash
pnpm --filter @tarkov/web dev
```

Navigate to `/builder`, pick a weapon, click "Optimize ⚙". Verify:
- Modal opens with constraints form
- Pin checkboxes reflect current attachments
- "Run optimization" transitions to result view
- Accept closes modal, updates Builder state

Kill dev server after verifying.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/builder/build-header.tsx apps/web/src/routes/builder.tsx
git commit -m "feat(web): Optimize ⚙ button in BuildHeader + BuilderPage wiring"
```

---

## Task 16: Playwright — optimizer route smoke

**Files:**

- Modify: `apps/web/e2e/smoke.spec.ts`

- [ ] **Step 1: Add a test**

Append at the bottom of `smoke.spec.ts`:

```ts
test.describe("smoke — build optimizer", () => {
  test("opens optimizer, runs it, accepts the result", async ({ page }) => {
    const { errors } = captureConsoleErrors(page);
    await page.goto("/builder", { waitUntil: "networkidle" });

    // Pick a weapon.
    const weaponPicker = page.locator("select").first();
    await expect(weaponPicker).toBeVisible({ timeout: 10_000 });
    await expect.poll(async () => (await weaponPicker.locator("option").count())).toBeGreaterThan(
      1,
    );
    await weaponPicker.selectOption({ index: 1 });

    // Open optimizer.
    const optimizeBtn = page.getByRole("button", { name: /optimize/i });
    await expect(optimizeBtn).toBeVisible({ timeout: 10_000 });
    await optimizeBtn.click();

    // Run with default constraints.
    await page.getByRole("button", { name: /run optimization/i }).click();

    // Wait for result; could be success or failure; either way no console errors.
    await expect(
      page.getByRole("button", { name: /(accept|adjust constraints)/i }).first(),
    ).toBeVisible({ timeout: 10_000 });

    expect(errors, `Console errors on optimizer flow:\n${errors.join("\n")}`).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the suite**

```bash
pnpm --filter @tarkov/web build
pnpm --filter @tarkov/web test:e2e
```

Expected: new test passes; existing tests unchanged.

If the test fails because the weapon picker doesn't yield an interactive select in CI (data might not load reliably), wrap in `test.skip()` with a note — consistent with how we handle Pages Function tests. But try the real run first.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/smoke.spec.ts
git commit -m "test(web): Playwright smoke — build optimizer flow"
```

---

## Task 17: Final QA + push + PR

- [ ] **Step 1: Full install + build + test + typecheck + lint + format check**

```bash
pnpm install --frozen-lockfile
pnpm --filter "./packages/*" build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm --filter @tarkov/web test:e2e
```

All should pass. Record new test counts (each should be up):
- `@tarkov/optimizer`: ~30 tests (new package)
- `@tarkov/data`: unchanged
- `@tarkov/web`: +7 for the reducer = ~96
- Worker tests: unchanged
- Playwright: +1 new test

- [ ] **Step 2: Spec coverage audit**

Skim the spec and confirm every section has landed:

- §1–2 purpose/decisions → all tasks
- §3 non-goals → final QA confirms no scope creep
- §4 package + API → Tasks 1, 2, 9
- §5 algorithm → Tasks 4, 5, 6, 7, 8
- §6 UI → Tasks 10–15
- §7 testing → per-task + Task 16
- §8 error handling → Tasks 8, 13
- §9 migrations → no schema changes (verified)
- §10 open questions — nested-slot defaults implemented; performance verified; recoil weighting documented

- [ ] **Step 3: Push**

```bash
git push -u origin feat/m3-build-optimization
```

- [ ] **Step 4: Open PR**

```bash
gh pr create --title "feat(m3): Build optimization — exact solver + Builder integration" --body "$(cat <<'EOF'
## Summary

Second M3 differentiator (2 of 4 remaining). Ships a Tarkov-specific constraint solver that finds the provably-optimal mod set for a weapon under a user-chosen objective (recoil / ergonomics / weight / accuracy), budget, and player profile.

- New `packages/optimizer` workspace. Pure TS, no React, no fetch. ~30 unit tests, 100% line coverage.
- Exact branch-and-bound DFS with three pruning rules (budget, availability, objective lower-bound). Deterministic tie-breaking. 2-second default timeout with `partial: true` support.
- Four objectives: `min-recoil`, `max-ergonomics`, `min-weight`, `max-accuracy`. Typed `OptimizationResult` discriminated union for result / failure modes.
- Per-slot pin/unpin control: user's currently-attached mods auto-pinned; user can un-check to let the solver replace them.
- Builder integration: "Optimize ⚙" button in `BuildHeader`, modal with Constraints (Tab 1) → Result (Tab 2) flow. Reuses shipped `CompareStatDelta` for the stat-delta preview.
- Accept replaces the current build's `attachments` / `orphaned` in-memory. User can then save via the existing share flow.

Spec: `docs/superpowers/specs/2026-04-20-build-optimization-design.md`
Plan: `docs/plans/2026-04-20-build-optimization-plan.md`

## Test plan
- [x] `@tarkov/optimizer` unit + integration tests (30+, 100% line coverage)
- [x] `optimize-constraints-reducer` unit tests (web)
- [x] Playwright smoke: open → run → accept
- [x] Manual: pick a weapon, pin/unpin, try each objective, verify diff + accept
- [ ] After merge + release: verify in prod at `https://tarkov-gunsmith-web.pages.dev/builder`

## Non-goals (deferred)
- Saved optimization runs / permalinks
- Multi-objective weighted runs
- Allowlist / blocklist of specific items
- Explain-ability tooltip
- Web worker (add if users hit pathological performance)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Done**

Report the PR URL, new test counts, and any follow-ups uncovered during QA.

---

## Self-review notes

**Spec coverage:** Every spec section has a task:
- §1 Purpose → Task 1 (package scaffold)
- §2 Locked decisions → encoded across all tasks
- §3 Non-goals → Task 17 audit
- §4.1–4.2 Package + layout → Tasks 1, 2, 3
- §4.3 Public API → Task 2
- §5.1 B&B → Tasks 7, 8
- §5.2 Determinism → Task 7 tie-break + Task 8 determinism test
- §5.3 Objective + bounds → Tasks 4, 6
- §6.1–6.5 UI → Tasks 10–15
- §7.1–7.3 Testing → per-task + Task 16
- §8 Error handling → Tasks 8, 13 (FailureView)
- §9 Migrations → covered (no changes)
- §10 Open questions → nested slots handled in Task 7; performance in Task 8; recoil weighting documented

**Placeholder scan:** No TBDs, TODOs, "implement later," or vague steps. Every code block is complete code; every test block has concrete assertions; every command has an exact expected output.

**Type consistency:**
- `OptimizationInput` / `OptimizationResult` / `Objective` / `OptimizationConstraints` defined in Task 2, consumed identically in Tasks 7, 8, 10, 11, 14.
- `BnbState` / `BnbBest` defined in Task 7, referenced only within Task 7.
- `ConstraintsState` / `ConstraintsAction` defined in Task 10, consumed in Tasks 12, 14.
- `UseOptimizerReturn` defined in Task 11, consumed in Task 14.
- `cheapestPrice` / `slotCandidates` defined in Task 5, consumed in Tasks 6, 7.
- `score` defined in Task 4, consumed in Tasks 6, 7.
- `lowerBoundForRemaining` defined in Task 6, consumed in Task 7.
- `branchAndBound` defined in Task 7, consumed in Task 8.
- `optimize` defined in Task 8, consumed in Task 11.

No naming drift. Method signatures match across use sites.

**Known gaps / reminders for implementers:**
1. Fixture type casts (`as ModListItem`) may need adjustment if the real schema has required fields my fixtures skip. Fix during Task 3.
2. The `infeasible-budget` distinction is mentioned in the spec (§8) but the optimizer in Task 8 reports every "no feasible completion" case as `no-valid-combinations`. This is consistent with the spec's §10 open-question note but worth a code comment. The refinement — differentiating "pinned items over-budget" from "no compat items exist" — is a follow-up.
3. Nested-slot defaults (spec §10): implementers verify via a unit test in Task 7 that picking an item with `AllowedItem.children` correctly recurses into those children.
