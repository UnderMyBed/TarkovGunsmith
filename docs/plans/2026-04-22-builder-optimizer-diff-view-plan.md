# Builder · Optimizer-first Diff View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the modal `OptimizeDialog` with a full-page `/builder?view=optimize` experience — solver rail + `CURRENT / ◇ OPTIMIZED / DELTA` stat triptych + per-row accept-selectable mod-changes diff table. Matches `docs/design/field-ledger-v2/index.html` builder-b artboard.

**Architecture:** Introduce a `view` search param (zod-validated) on the existing `/builder` and `/builder/$id` routes. `BuilderPage` branches on `view`; `"editor"` keeps today's slot-tree UI, `"optimize"` renders a new `<OptimizeView>` that owns constraints state, `useOptimizer`, and per-row selection. Lift `useTarkovTrackerSync` from `ProfileEditor` up to `BuilderPage` so `ProfileEditor` and the optimizer's `ProfileReadout` share one sync state machine. Retire `OptimizeDialog` and `OptimizeResultView` entirely.

**Tech Stack:** TanStack Router (file-based routes, `validateSearch`), zod 4, React 19, Tailwind v4 (arbitrary values against `@tarkov/ui` CSS custom properties), Vitest 4 (colocated `.test.ts`/`.test.tsx`), Playwright 1.x (Chromium smoke tests).

---

## File Structure

```
apps/web/src/features/builder/optimize/
├── optimize-constraints-form.tsx      (kept; re-slotted into OptimizeView)
├── optimize-constraints-reducer.ts    (unchanged)
├── optimize-constraints-reducer.test.ts (unchanged)
├── useOptimizer.ts                    (unchanged)
├── optimize-dialog.tsx                (DELETE in Task 11)
├── optimize-result-view.tsx           (DELETE in Task 11)
├── slot-diff.ts                       (NEW — Task 1)
├── slot-diff.test.ts                  (NEW — Task 1)
├── build-from-selection.ts            (NEW — Task 2)
├── build-from-selection.test.ts       (NEW — Task 2)
├── optimize-triptych.tsx              (NEW — Task 4)
├── optimize-triptych.test.tsx         (NEW — Task 4)
├── mod-changes-table.tsx              (NEW — Task 5)
├── mod-changes-table.test.tsx         (NEW — Task 5)
├── profile-readout.tsx                (NEW — Task 6)
├── profile-readout.test.tsx           (NEW — Task 6)
├── optimize-view.tsx                  (NEW — Task 8)
├── optimize-view.test.tsx             (NEW — Task 8)
└── index.ts                           (MODIFY — re-exports; Task 11)

apps/web/src/features/builder/
├── profile-editor.tsx                 (MODIFY — Task 7; accept `sync` prop)
└── build-header.tsx                   (MODIFY — Task 10; button label)

apps/web/src/routes/
├── builder.tsx                        (MODIFY — Tasks 7, 9; validateSearch + view branch + lifted sync)
├── builder.$id.tsx                    (MODIFY — Task 9; validateSearch; pass view through)
└── index.tsx                          (MODIFY — Task 12; TRY OPTIMIZER href)

apps/web/e2e/
└── builder-optimizer.spec.ts          (NEW — Task 13)

packages/ui/src/
├── styles/index.css                   (MODIFY — Task 3; bracket-olive variant)
└── components/card.tsx                (MODIFY — Task 3; `variant: "bracket-olive"`)
```

---

## Task 1: Pure helper — `slotDiff`

**Purpose:** Walk current vs proposed attachment maps and emit one `ChangedRow` per differing slot. Stats are looked up from `modList`; sort mirrors the slot tree's flat walk.

**Files:**
- Create: `apps/web/src/features/builder/optimize/slot-diff.ts`
- Create: `apps/web/src/features/builder/optimize/slot-diff.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/features/builder/optimize/slot-diff.test.ts
import { describe, it, expect } from "vitest";
import { slotDiff, type ChangedRow } from "./slot-diff.js";
import type { ModListItem, WeaponTree } from "@tarkov/data";

const slotTree: WeaponTree = {
  weaponId: "w1",
  slots: [
    { path: "muzzle", name: "Muzzle", nameId: "muzzle", allowedItems: [] },
    { path: "handguard", name: "Handguard", nameId: "handguard", allowedItems: [] },
    { path: "stock", name: "Stock", nameId: "stock", allowedItems: [] },
  ],
} as unknown as WeaponTree;

const modList: readonly ModListItem[] = [
  { id: "m-old", name: "Old Muzzle", ergonomics: 2, recoilModifier: -5, price: 10_000 } as ModListItem,
  { id: "m-new", name: "New Muzzle", ergonomics: 3, recoilModifier: -9, price: 22_000 } as ModListItem,
  { id: "h-new", name: "New Handguard", ergonomics: 4, recoilModifier: -2, price: 8_000 } as ModListItem,
];

describe("slotDiff", () => {
  it("emits one ChangedRow per swapped slot in slot-tree order", () => {
    const rows = slotDiff(
      { muzzle: "m-old", stock: "s-keep" },
      { muzzle: "m-new", handguard: "h-new", stock: "s-keep" },
      slotTree,
      modList,
    );
    expect(rows.map((r) => r.slotId)).toEqual(["muzzle", "handguard"]);
  });

  it("marks added slot with currentName=null", () => {
    const [, hg] = slotDiff(
      { muzzle: "m-old" },
      { muzzle: "m-old", handguard: "h-new" },
      slotTree,
      modList,
    );
    expect(hg).toMatchObject({ slotId: "handguard", currentName: null, proposedName: "New Handguard" });
  });

  it("marks removed slot with proposedName=null", () => {
    const [row] = slotDiff(
      { muzzle: "m-old", handguard: "h-new" },
      { muzzle: "m-old" },
      slotTree,
      modList,
    );
    expect(row).toMatchObject({ slotId: "handguard", currentName: "New Handguard", proposedName: null });
  });

  it("excludes unchanged slots", () => {
    const rows = slotDiff(
      { muzzle: "m-old", handguard: "h-new" },
      { muzzle: "m-old", handguard: "h-new" },
      slotTree,
      modList,
    );
    expect(rows).toEqual([]);
  });

  it("falls back to the mod id when the mod is missing from modList", () => {
    const [row] = slotDiff({ muzzle: "m-old" }, { muzzle: "m-missing" }, slotTree, modList);
    expect(row).toMatchObject({ proposedName: "m-missing", proposedErgo: 0, proposedRecoil: 0, proposedPrice: 0 });
  });

  it("computes per-row deltas (proposed minus current)", () => {
    const [row] = slotDiff({ muzzle: "m-old" }, { muzzle: "m-new" }, slotTree, modList);
    expect(row).toMatchObject<Partial<ChangedRow>>({
      ergoDelta: 1,      // 3 - 2
      recoilDelta: -4,   // -9 - -5
      priceDelta: 12_000, // 22_000 - 10_000
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tarkov/web test -- slot-diff`
Expected: FAIL with "Cannot find module './slot-diff.js'".

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/features/builder/optimize/slot-diff.ts
import type { ModListItem, WeaponTree } from "@tarkov/data";

export interface ChangedRow {
  readonly slotId: string;
  readonly slotLabel: string;
  readonly currentName: string | null;
  readonly proposedName: string | null;
  readonly currentErgo: number;
  readonly currentRecoil: number;
  readonly currentPrice: number;
  readonly proposedErgo: number;
  readonly proposedRecoil: number;
  readonly proposedPrice: number;
  readonly ergoDelta: number;
  readonly recoilDelta: number;
  readonly priceDelta: number;
}

interface ModStats {
  readonly name: string | null;
  readonly ergo: number;
  readonly recoil: number;
  readonly price: number;
}

function lookupMod(id: string | undefined, modList: readonly ModListItem[]): ModStats {
  if (id === undefined) return { name: null, ergo: 0, recoil: 0, price: 0 };
  const m = modList.find((x) => x.id === id);
  if (m === undefined) return { name: id, ergo: 0, recoil: 0, price: 0 };
  return {
    name: m.name,
    ergo: m.ergonomics ?? 0,
    recoil: m.recoilModifier ?? 0,
    price: m.price ?? 0,
  };
}

export function slotDiff(
  current: Readonly<Record<string, string>>,
  proposed: Readonly<Record<string, string>>,
  slotTree: WeaponTree,
  modList: readonly ModListItem[],
): readonly ChangedRow[] {
  const rows: ChangedRow[] = [];
  const walked = new Set<string>();

  for (const slot of slotTree.slots) {
    const c = current[slot.path];
    const p = proposed[slot.path];
    walked.add(slot.path);
    if (c === p) continue;
    const cm = lookupMod(c, modList);
    const pm = lookupMod(p, modList);
    rows.push({
      slotId: slot.path,
      slotLabel: slot.name || slot.nameId || slot.path,
      currentName: cm.name,
      proposedName: pm.name,
      currentErgo: cm.ergo,
      currentRecoil: cm.recoil,
      currentPrice: cm.price,
      proposedErgo: pm.ergo,
      proposedRecoil: pm.recoil,
      proposedPrice: pm.price,
      ergoDelta: pm.ergo - cm.ergo,
      recoilDelta: pm.recoil - cm.recoil,
      priceDelta: pm.price - cm.price,
    });
  }

  // Catch slot paths that exist in either map but not in the slot tree's flat walk.
  for (const key of new Set([...Object.keys(current), ...Object.keys(proposed)])) {
    if (walked.has(key)) continue;
    const c = current[key];
    const p = proposed[key];
    if (c === p) continue;
    const cm = lookupMod(c, modList);
    const pm = lookupMod(p, modList);
    rows.push({
      slotId: key,
      slotLabel: key.toUpperCase(),
      currentName: cm.name,
      proposedName: pm.name,
      currentErgo: cm.ergo,
      currentRecoil: cm.recoil,
      currentPrice: cm.price,
      proposedErgo: pm.ergo,
      proposedRecoil: pm.recoil,
      proposedPrice: pm.price,
      ergoDelta: pm.ergo - cm.ergo,
      recoilDelta: pm.recoil - cm.recoil,
      priceDelta: pm.price - cm.price,
    });
  }

  return rows;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tarkov/web test -- slot-diff`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/builder/optimize/slot-diff.ts apps/web/src/features/builder/optimize/slot-diff.test.ts
git commit -m "feat(builder): slotDiff pure helper for optimizer diff view"
```

---

## Task 2: Pure helper — `buildFromSelection`

**Purpose:** Given the current build, the solver's proposed build, and a `Set<slotId>` of accepted rows, return a merged `BuildV4` whose attachments are `currentBuild.attachments` overlaid with only the selected slots from `proposedBuild.attachments`.

**Files:**
- Create: `apps/web/src/features/builder/optimize/build-from-selection.ts`
- Create: `apps/web/src/features/builder/optimize/build-from-selection.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/features/builder/optimize/build-from-selection.test.ts
import { describe, it, expect } from "vitest";
import type { BuildV4 } from "@tarkov/data";
import { buildFromSelection } from "./build-from-selection.js";

const current: BuildV4 = {
  version: 4,
  weaponId: "w1",
  attachments: { muzzle: "m-old", handguard: "h-old", stock: "s-keep" },
  orphaned: [],
  createdAt: "2026-04-22T00:00:00Z",
};

const proposed: BuildV4 = {
  version: 4,
  weaponId: "w1",
  attachments: { muzzle: "m-new", handguard: "h-new", optic: "o-new" },
  orphaned: [],
  createdAt: "2026-04-22T00:00:00Z",
};

describe("buildFromSelection", () => {
  it("equals current build when nothing is selected", () => {
    const out = buildFromSelection(current, proposed, new Set());
    expect(out.attachments).toEqual(current.attachments);
  });

  it("applies every proposed change when all slots selected", () => {
    const out = buildFromSelection(current, proposed, new Set(["muzzle", "handguard", "optic"]));
    // stock stays because proposed dropped it; optic is a new addition from the proposal.
    expect(out.attachments).toEqual({ muzzle: "m-new", handguard: "h-new", stock: "s-keep", optic: "o-new" });
  });

  it("applies only the selected slots (partial)", () => {
    const out = buildFromSelection(current, proposed, new Set(["muzzle"]));
    expect(out.attachments).toEqual({ muzzle: "m-new", handguard: "h-old", stock: "s-keep" });
  });

  it("removes a slot when selected and proposal drops it", () => {
    const current2: BuildV4 = { ...current, attachments: { muzzle: "m-old", handguard: "h-old" } };
    const proposed2: BuildV4 = { ...proposed, attachments: { muzzle: "m-new" } };
    const out = buildFromSelection(current2, proposed2, new Set(["handguard"]));
    expect(out.attachments).toEqual({ muzzle: "m-old" });
  });

  it("preserves metadata (weaponId, orphaned, createdAt) from current", () => {
    const out = buildFromSelection(current, proposed, new Set(["muzzle"]));
    expect(out.weaponId).toBe(current.weaponId);
    expect(out.orphaned).toEqual(current.orphaned);
    expect(out.createdAt).toBe(current.createdAt);
    expect(out.version).toBe(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tarkov/web test -- build-from-selection`
Expected: FAIL with "Cannot find module './build-from-selection.js'".

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/features/builder/optimize/build-from-selection.ts
import type { BuildV4 } from "@tarkov/data";

export function buildFromSelection(
  current: BuildV4,
  proposed: BuildV4,
  selected: ReadonlySet<string>,
): BuildV4 {
  const merged: Record<string, string> = { ...current.attachments };
  for (const slotId of selected) {
    const proposedValue = proposed.attachments[slotId];
    if (proposedValue === undefined) {
      delete merged[slotId];
    } else {
      merged[slotId] = proposedValue;
    }
  }
  return {
    version: 4,
    weaponId: current.weaponId,
    attachments: merged,
    orphaned: current.orphaned,
    createdAt: current.createdAt,
    ...(current.name !== undefined ? { name: current.name } : {}),
    ...(current.description !== undefined ? { description: current.description } : {}),
    ...(current.profileSnapshot !== undefined ? { profileSnapshot: current.profileSnapshot } : {}),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tarkov/web test -- build-from-selection`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/builder/optimize/build-from-selection.ts apps/web/src/features/builder/optimize/build-from-selection.test.ts
git commit -m "feat(builder): buildFromSelection pure helper for partial accept"
```

---

## Task 3: `@tarkov/ui` — `bracket-olive` Card variant

**Purpose:** The `◇ OPTIMIZED` triptych card uses olive corner L-markers instead of amber. Extend the existing `bracket` variant with a sibling `bracket-olive`.

**Files:**
- Modify: `packages/ui/src/components/card.tsx`
- Modify: `packages/ui/src/styles/index.css`

- [ ] **Step 1: Read current card component and bracket CSS**

Run:
```bash
grep -n "variant\|bracket" /mnt/c/Users/Matt/Source/TarkovGunsmith/.worktrees/builder-optimizer-diff-view/packages/ui/src/components/card.tsx
grep -n "bracket\|::before\|::after" /mnt/c/Users/Matt/Source/TarkovGunsmith/.worktrees/builder-optimizer-diff-view/packages/ui/src/styles/index.css
```

Read both results. Expected: `card.tsx` accepts `variant?: "default" | "bracket"`; `styles/index.css` defines `.card-bracket` with `::before`/`::after` pseudo-elements coloured via `var(--color-primary)`.

- [ ] **Step 2: Write the failing test**

```ts
// packages/ui/src/components/card.test.tsx
// (Append to the existing file if it exists; otherwise create.)
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Card } from "./card.js";

describe("Card bracket-olive variant", () => {
  it("applies the card-bracket-olive class when variant='bracket-olive'", () => {
    const { container } = render(<Card variant="bracket-olive" data-testid="c" />);
    expect(container.firstChild).toHaveClass("card-bracket-olive");
  });
});
```

If `card.test.tsx` does not exist yet, create it with the block above plus a minimal default-variant sanity test.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @tarkov/ui test -- card`
Expected: FAIL — type error on `variant="bracket-olive"` OR assertion failure.

- [ ] **Step 4: Update the Card component**

Edit `packages/ui/src/components/card.tsx`:
- Change the `variant` prop type to `"default" | "bracket" | "bracket-olive"`.
- In the className switch, map `"bracket-olive"` to `"card-bracket-olive"`.

Show the exact patch to make. For example, if the existing code reads:

```tsx
variant?: "default" | "bracket";
...
variant === "bracket" ? "card-bracket" : ""
```

Change to:

```tsx
variant?: "default" | "bracket" | "bracket-olive";
...
variant === "bracket" ? "card-bracket" : variant === "bracket-olive" ? "card-bracket-olive" : ""
```

- [ ] **Step 5: Add the olive bracket CSS**

Append to `packages/ui/src/styles/index.css` right after the existing `.card-bracket` block:

```css
.card-bracket-olive {
  position: relative;
}
.card-bracket-olive::before,
.card-bracket-olive::after {
  content: "";
  position: absolute;
  width: 14px;
  height: 14px;
  border: 1px solid var(--color-olive);
  pointer-events: none;
}
.card-bracket-olive::before {
  top: -1px;
  left: -1px;
  border-right: 0;
  border-bottom: 0;
}
.card-bracket-olive::after {
  bottom: -1px;
  right: -1px;
  border-left: 0;
  border-top: 0;
}
```

(Mirrors the existing `.card-bracket::before/::after` shape but uses `var(--color-olive)`.)

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @tarkov/ui test -- card`
Expected: PASS.

Also run `pnpm --filter @tarkov/ui build` to verify the CSS compiles.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/components/card.tsx packages/ui/src/components/card.test.tsx packages/ui/src/styles/index.css
git commit -m "feat(ui): Card bracket-olive variant for optimizer triptych"
```

---

## Task 4: `OptimizeTriptych` component

**Purpose:** Render three bracket cards (`CURRENT BUILD`, `◇ OPTIMIZED`, `DELTA`) with a 2×2 stat grid each: `RECOIL V`, `ERGO`, `WT kg`, `₽`. Idle state renders `—` placeholders at 60% opacity. Running renders `<Skeleton>` shimmers on OPTIMIZED + DELTA.

**Files:**
- Create: `apps/web/src/features/builder/optimize/optimize-triptych.tsx`
- Create: `apps/web/src/features/builder/optimize/optimize-triptych.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/features/builder/optimize/optimize-triptych.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { OptimizeTriptych } from "./optimize-triptych.js";
import type { WeaponSpec } from "@tarkov/ballistics";

const current: WeaponSpec = {
  ergonomics: 50,
  verticalRecoil: 150,
  horizontalRecoil: 300,
  weight: 3.5,
  accuracy: 2.5,
  modCount: 5,
} as WeaponSpec;

const optimized: WeaponSpec = {
  ergonomics: 58,
  verticalRecoil: 120,
  horizontalRecoil: 260,
  weight: 3.1,
  accuracy: 2.2,
  modCount: 6,
} as WeaponSpec;

describe("OptimizeTriptych", () => {
  it("renders CURRENT numerics, OPTIMIZED numerics, and derived DELTA numerics", () => {
    const { getByTestId } = render(
      <OptimizeTriptych
        current={current}
        optimized={optimized}
        priceCurrent={250_000}
        priceOptimized={200_000}
      />,
    );
    expect(getByTestId("triptych-current-ergo").textContent).toContain("50");
    expect(getByTestId("triptych-optimized-ergo").textContent).toContain("58");
    // Delta: +8 ergo (higher-is-better → olive)
    const deltaErgo = getByTestId("triptych-delta-ergo");
    expect(deltaErgo.textContent).toContain("+8");
    expect(deltaErgo.className).toContain("text-[var(--color-olive)]");
  });

  it("renders — placeholders when optimized is null (idle state)", () => {
    const { getAllByText } = render(
      <OptimizeTriptych
        current={current}
        optimized={null}
        priceCurrent={250_000}
        priceOptimized={null}
      />,
    );
    // 4 stats in OPTIMIZED card + 4 in DELTA card = 8 placeholders.
    expect(getAllByText("—").length).toBeGreaterThanOrEqual(8);
  });

  it("colours recoil improvement (lower) as olive and regression (higher) as destructive", () => {
    const { getByTestId } = render(
      <OptimizeTriptych
        current={current}
        optimized={{ ...optimized, verticalRecoil: 160 }}
        priceCurrent={100}
        priceOptimized={100}
      />,
    );
    const deltaRecoil = getByTestId("triptych-delta-recoil");
    expect(deltaRecoil.textContent).toContain("+10");
    expect(deltaRecoil.className).toContain("text-[var(--color-destructive)]");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tarkov/web test -- optimize-triptych`
Expected: FAIL — "Cannot find module './optimize-triptych.js'".

- [ ] **Step 3: Write implementation**

```tsx
// apps/web/src/features/builder/optimize/optimize-triptych.tsx
import type { ReactElement } from "react";
import type { WeaponSpec } from "@tarkov/ballistics";
import { Card, Skeleton } from "@tarkov/ui";

export interface OptimizeTriptychProps {
  current: WeaponSpec | null;
  optimized: WeaponSpec | null;
  priceCurrent: number | null;
  priceOptimized: number | null;
  running?: boolean;
}

type StatKey = "recoil" | "ergo" | "weight" | "price";

interface StatDef {
  readonly key: StatKey;
  readonly label: string;
  readonly lowerIsBetter: boolean;
  readonly format: (v: number) => string;
  readonly select: (s: WeaponSpec, price: number | null) => number | null;
}

const STATS: readonly StatDef[] = [
  {
    key: "recoil",
    label: "RECOIL V",
    lowerIsBetter: true,
    format: (v) => v.toFixed(0),
    select: (s) => s.verticalRecoil,
  },
  {
    key: "ergo",
    label: "ERGO",
    lowerIsBetter: false,
    format: (v) => v.toFixed(0),
    select: (s) => s.ergonomics,
  },
  {
    key: "weight",
    label: "WT kg",
    lowerIsBetter: true,
    format: (v) => v.toFixed(2),
    select: (s) => s.weight,
  },
  {
    key: "price",
    label: "₽",
    lowerIsBetter: true,
    format: (v) => `${(v / 1000).toFixed(1)}k`,
    select: (_s, price) => price,
  },
];

function deltaClass(delta: number, lowerIsBetter: boolean): string {
  if (Math.abs(delta) < 0.005) return "text-[var(--color-paper-dim)]";
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  return improved ? "text-[var(--color-olive)]" : "text-[var(--color-destructive)]";
}

function formatDelta(delta: number, stat: StatDef): string {
  if (Math.abs(delta) < 0.005) return "0";
  const sign = delta > 0 ? "+" : "−";
  const abs = stat.format(Math.abs(delta));
  return `${sign}${abs}`;
}

export function OptimizeTriptych({
  current,
  optimized,
  priceCurrent,
  priceOptimized,
  running = false,
}: OptimizeTriptychProps): ReactElement {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card variant="bracket" className="p-4">
        <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-paper-dim)]">
          CURRENT BUILD
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {STATS.map((stat) => {
            const value = current === null ? null : stat.select(current, priceCurrent);
            return (
              <div key={stat.key}>
                <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-muted-foreground)]">
                  {stat.label}
                </div>
                <div
                  className="font-mono text-xl text-[var(--color-foreground)] mt-0.5"
                  data-testid={`triptych-current-${stat.key}`}
                >
                  {value === null ? "—" : stat.format(value)}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card variant="bracket-olive" className="p-4">
        <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-olive)]">
          ◇ OPTIMIZED
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {STATS.map((stat) => {
            const value = optimized === null ? null : stat.select(optimized, priceOptimized);
            return (
              <div key={stat.key}>
                <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-muted-foreground)]">
                  {stat.label}
                </div>
                <div
                  className="font-mono text-xl text-[var(--color-foreground)] mt-0.5"
                  data-testid={`triptych-optimized-${stat.key}`}
                >
                  {running ? (
                    <Skeleton width="60%" height="1.25rem" />
                  ) : value === null ? (
                    <span className="opacity-60">—</span>
                  ) : (
                    stat.format(value)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card variant="bracket" className="p-4">
        <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-primary)]">
          DELTA
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {STATS.map((stat) => {
            if (current === null || optimized === null) {
              return (
                <div key={stat.key}>
                  <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-muted-foreground)]">
                    {stat.label}
                  </div>
                  <div
                    className="font-mono text-xl text-[var(--color-foreground)] mt-0.5 opacity-60"
                    data-testid={`triptych-delta-${stat.key}`}
                  >
                    —
                  </div>
                </div>
              );
            }
            const cv = stat.select(current, priceCurrent);
            const ov = stat.select(optimized, priceOptimized);
            if (cv === null || ov === null) {
              return (
                <div key={stat.key}>
                  <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-muted-foreground)]">
                    {stat.label}
                  </div>
                  <div
                    className="font-mono text-xl text-[var(--color-foreground)] mt-0.5 opacity-60"
                    data-testid={`triptych-delta-${stat.key}`}
                  >
                    —
                  </div>
                </div>
              );
            }
            const delta = ov - cv;
            return (
              <div key={stat.key}>
                <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-muted-foreground)]">
                  {stat.label}
                </div>
                <div
                  className={`font-mono text-xl mt-0.5 ${deltaClass(delta, stat.lowerIsBetter)}`}
                  data-testid={`triptych-delta-${stat.key}`}
                >
                  {formatDelta(delta, stat)}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tarkov/web test -- optimize-triptych`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/builder/optimize/optimize-triptych.tsx apps/web/src/features/builder/optimize/optimize-triptych.test.tsx
git commit -m "feat(builder): OptimizeTriptych component — CURRENT / OPTIMIZED / DELTA cards"
```

---

## Task 5: `ModChangesTable` component

**Purpose:** Render the diff table. Per-row checkboxes drive selection. Header shows N-changed / M-unchanged pills + score-delta. Footer has `ACCEPT ALL` · `ACCEPT SELECTED (N)` · `DISCARD`.

**Files:**
- Create: `apps/web/src/features/builder/optimize/mod-changes-table.tsx`
- Create: `apps/web/src/features/builder/optimize/mod-changes-table.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/features/builder/optimize/mod-changes-table.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModChangesTable } from "./mod-changes-table.js";
import type { ChangedRow } from "./slot-diff.js";

const row = (overrides: Partial<ChangedRow> = {}): ChangedRow => ({
  slotId: "muzzle",
  slotLabel: "MUZZLE",
  currentName: "Old Muzzle",
  proposedName: "New Muzzle",
  currentErgo: 2,
  currentRecoil: -5,
  currentPrice: 10_000,
  proposedErgo: 3,
  proposedRecoil: -9,
  proposedPrice: 22_000,
  ergoDelta: 1,
  recoilDelta: -4,
  priceDelta: 12_000,
  ...overrides,
});

describe("ModChangesTable", () => {
  it("renders idle empty state when rows is empty and running=false", () => {
    render(
      <ModChangesTable
        rows={[]}
        selected={new Set()}
        onToggle={vi.fn()}
        onAcceptAll={vi.fn()}
        onAcceptSelected={vi.fn()}
        onDiscard={vi.fn()}
        scoreDelta={null}
        mode="idle"
        unchangedCount={0}
      />,
    );
    expect(screen.getByText(/RUN THE SOLVER/)).toBeInTheDocument();
  });

  it("renders rows and reflects ACCEPT SELECTED (N) count from selected set", () => {
    const rows = [row({ slotId: "muzzle" }), row({ slotId: "handguard", slotLabel: "HANDGUARD" })];
    render(
      <ModChangesTable
        rows={rows}
        selected={new Set(["muzzle"])}
        onToggle={vi.fn()}
        onAcceptAll={vi.fn()}
        onAcceptSelected={vi.fn()}
        onDiscard={vi.fn()}
        scoreDelta={-3.04}
        mode="result"
        unchangedCount={12}
      />,
    );
    expect(screen.getByRole("button", { name: /ACCEPT SELECTED \(1\)/ })).toBeEnabled();
    expect(screen.getByText(/2 SLOTS CHANGED/)).toBeInTheDocument();
    expect(screen.getByText(/12 SLOTS UNCHANGED/)).toBeInTheDocument();
  });

  it("toggles a row via the per-row checkbox", () => {
    const onToggle = vi.fn();
    render(
      <ModChangesTable
        rows={[row()]}
        selected={new Set(["muzzle"])}
        onToggle={onToggle}
        onAcceptAll={vi.fn()}
        onAcceptSelected={vi.fn()}
        onDiscard={vi.fn()}
        scoreDelta={0}
        mode="result"
        unchangedCount={0}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Accept MUZZLE/ }));
    expect(onToggle).toHaveBeenCalledWith("muzzle");
  });

  it("disables ACCEPT SELECTED when selected is empty", () => {
    render(
      <ModChangesTable
        rows={[row()]}
        selected={new Set()}
        onToggle={vi.fn()}
        onAcceptAll={vi.fn()}
        onAcceptSelected={vi.fn()}
        onDiscard={vi.fn()}
        scoreDelta={0}
        mode="result"
        unchangedCount={0}
      />,
    );
    expect(screen.getByRole("button", { name: /ACCEPT SELECTED \(0\)/ })).toBeDisabled();
  });

  it("renders zero-change state when mode='result' and rows is empty", () => {
    render(
      <ModChangesTable
        rows={[]}
        selected={new Set()}
        onToggle={vi.fn()}
        onAcceptAll={vi.fn()}
        onAcceptSelected={vi.fn()}
        onDiscard={vi.fn()}
        scoreDelta={0}
        mode="result"
        unchangedCount={14}
      />,
    );
    expect(screen.getByText(/NO IMPROVEMENTS FOUND/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ACCEPT ALL/ })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tarkov/web test -- mod-changes-table`
Expected: FAIL — "Cannot find module".

- [ ] **Step 3: Write implementation**

```tsx
// apps/web/src/features/builder/optimize/mod-changes-table.tsx
import type { ReactElement } from "react";
import { Button, Card, Pill } from "@tarkov/ui";
import type { ChangedRow } from "./slot-diff.js";

export type TableMode = "idle" | "running" | "result";

export interface ModChangesTableProps {
  rows: readonly ChangedRow[];
  selected: ReadonlySet<string>;
  onToggle: (slotId: string) => void;
  onAcceptAll: () => void;
  onAcceptSelected: () => void;
  onDiscard: () => void;
  scoreDelta: number | null;
  mode: TableMode;
  unchangedCount: number;
}

function deltaClass(delta: number, lowerIsBetter: boolean): string {
  if (Math.abs(delta) < 0.005) return "text-[var(--color-paper-dim)]";
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  return improved ? "text-[var(--color-olive)]" : "text-[var(--color-destructive)]";
}

function fmtSigned(value: number, decimals = 0): string {
  if (Math.abs(value) < 0.005) return "0";
  const sign = value > 0 ? "+" : "−";
  return `${sign}${Math.abs(value).toFixed(decimals)}`;
}

function fmtPrice(value: number): string {
  if (Math.abs(value) < 1) return "0";
  const sign = value > 0 ? "+" : "−";
  return `${sign}${(Math.abs(value) / 1000).toFixed(1)}k`;
}

export function ModChangesTable({
  rows,
  selected,
  onToggle,
  onAcceptAll,
  onAcceptSelected,
  onDiscard,
  scoreDelta,
  mode,
  unchangedCount,
}: ModChangesTableProps): ReactElement {
  const cols = "grid-cols-[32px_120px_1.2fr_1.2fr_56px_56px_80px]";
  const hasRows = rows.length > 0;
  const selectedCount = selected.size;
  const isResult = mode === "result";

  return (
    <Card variant="bracket" className="flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-dashed border-[var(--color-border)] px-4 py-3">
        <span className="font-display text-base tracking-wide">MOD CHANGES</span>
        <Pill tone="accent">{rows.length} SLOTS CHANGED</Pill>
        <Pill tone="muted">{unchangedCount} SLOTS UNCHANGED</Pill>
        {scoreDelta !== null && (
          <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            SCORE Δ · {scoreDelta >= 0 ? "+" : "−"}
            {Math.abs(scoreDelta).toFixed(2)}
          </span>
        )}
      </div>

      <div className={`grid ${cols} gap-2 border-b border-[var(--color-border)] px-4 py-2`}>
        <span />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          SLOT
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          CURRENT
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          SUGGESTED
        </span>
        <span className="text-right font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          ERGO
        </span>
        <span className="text-right font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          RCL
        </span>
        <span className="text-right font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          ₽
        </span>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-auto max-h-[420px]">
        {mode === "idle" && (
          <p className="py-12 text-center font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-paper-dim)]">
            RUN THE SOLVER TO SEE PROPOSED CHANGES
          </p>
        )}
        {mode === "running" && (
          <p className="py-12 text-center font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-paper-dim)]">
            RUNNING…
          </p>
        )}
        {isResult && !hasRows && (
          <p className="py-12 text-center font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-paper-dim)]">
            NO IMPROVEMENTS FOUND · TRY A DIFFERENT OBJECTIVE
          </p>
        )}
        {isResult &&
          hasRows &&
          rows.map((row) => (
            <div
              key={row.slotId}
              className={`grid ${cols} items-center gap-2 border-b border-dashed border-[var(--color-border)] px-4 py-2.5`}
            >
              <input
                type="checkbox"
                aria-label={`Accept ${row.slotLabel} change`}
                checked={selected.has(row.slotId)}
                onChange={() => onToggle(row.slotId)}
              />
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-primary)]">
                {row.slotLabel}
              </span>
              <span className="text-[13px] text-[var(--color-paper-dim)] line-through decoration-[var(--color-border)]">
                {row.currentName ?? "—"}
              </span>
              <span className="text-[13px] text-[var(--color-olive)]">
                → {row.proposedName ?? "— (removed)"}
              </span>
              <span className={`text-right font-mono text-xs ${deltaClass(row.ergoDelta, false)}`}>
                {fmtSigned(row.ergoDelta)}
              </span>
              <span className={`text-right font-mono text-xs ${deltaClass(row.recoilDelta, true)}`}>
                {fmtSigned(row.recoilDelta)}
              </span>
              <span className={`text-right font-mono text-xs ${deltaClass(row.priceDelta, true)}`}>
                {fmtPrice(row.priceDelta)}
              </span>
            </div>
          ))}
      </div>

      <div className="flex items-center gap-2 border-t border-[var(--color-border)] px-4 py-3">
        <Button onClick={onAcceptAll} disabled={!isResult || !hasRows}>
          ACCEPT ALL
        </Button>
        <Button
          variant="secondary"
          onClick={onAcceptSelected}
          disabled={!isResult || !hasRows || selectedCount === 0}
        >
          ACCEPT SELECTED ({selectedCount})
        </Button>
        <Button variant="ghost" onClick={onDiscard}>
          {isResult && !hasRows ? "BACK TO EDITOR" : "DISCARD"}
        </Button>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          DFS · LINEAR LOWER-BOUND PRUNE · 2s BUDGET
        </span>
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tarkov/web test -- mod-changes-table`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/builder/optimize/mod-changes-table.tsx apps/web/src/features/builder/optimize/mod-changes-table.test.tsx
git commit -m "feat(builder): ModChangesTable with per-row accept-selectable diff"
```

---

## Task 6: `ProfileReadout` component

**Purpose:** Read-only 9-trader LL grid + TarkovTracker timestamp + `RE-IMPORT` + `EDIT PROFILE ▸` link.

**Files:**
- Create: `apps/web/src/features/builder/optimize/profile-readout.tsx`
- Create: `apps/web/src/features/builder/optimize/profile-readout.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/features/builder/optimize/profile-readout.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProfileReadout } from "./profile-readout.js";
import type { PlayerProfile } from "@tarkov/data";
import type { UseTarkovTrackerSyncResult } from "../useTarkovTrackerSync.js";

const profile: PlayerProfile = {
  mode: "advanced",
  traders: { prapor: 4, therapist: 3, skier: 3, peacekeeper: 2, mechanic: 3, ragman: 2, jaeger: 3 },
  flea: true,
  completedQuests: [],
} as PlayerProfile;

function sync(state: "disconnected" | "syncing" | "synced" | "error"): UseTarkovTrackerSyncResult {
  const detail =
    state === "synced"
      ? { state, lastSyncedAt: Date.now() - 2 * 3600_000, questCount: 50, playerLevel: 20, unmappedCount: 0 }
      : state === "error"
      ? { state, kind: "network" as const, message: "offline" }
      : { state };
  return {
    state,
    detail: detail as never,
    connect: vi.fn(),
    reSync: vi.fn(),
    disconnect: vi.fn(),
  };
}

describe("ProfileReadout", () => {
  it("shows MANUAL meta and disables RE-IMPORT when disconnected", () => {
    render(
      <ProfileReadout profile={profile} sync={sync("disconnected")} onEditProfile={vi.fn()} />,
    );
    expect(screen.getByText(/MANUAL/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /RE-IMPORT/ })).toBeDisabled();
  });

  it("shows TARKOVTRACKER · Nh AGO and enables RE-IMPORT when synced", () => {
    render(<ProfileReadout profile={profile} sync={sync("synced")} onEditProfile={vi.fn()} />);
    expect(screen.getByText(/TARKOVTRACKER · 2H AGO/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /RE-IMPORT/ })).toBeEnabled();
  });

  it("calls sync.reSync when RE-IMPORT clicked", () => {
    const s = sync("synced");
    render(<ProfileReadout profile={profile} sync={s} onEditProfile={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /RE-IMPORT/ }));
    expect(s.reSync).toHaveBeenCalled();
  });

  it("calls onEditProfile when EDIT PROFILE link clicked", () => {
    const onEditProfile = vi.fn();
    render(
      <ProfileReadout profile={profile} sync={sync("disconnected")} onEditProfile={onEditProfile} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /EDIT PROFILE/ }));
    expect(onEditProfile).toHaveBeenCalled();
  });

  it("renders all 7 trader rows with level values", () => {
    render(<ProfileReadout profile={profile} sync={sync("disconnected")} onEditProfile={vi.fn()} />);
    expect(screen.getByText(/PRAPOR/)).toBeInTheDocument();
    expect(screen.getByText(/JAEGER/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tarkov/web test -- profile-readout`
Expected: FAIL — "Cannot find module".

- [ ] **Step 3: Write implementation**

```tsx
// apps/web/src/features/builder/optimize/profile-readout.tsx
import type { ReactElement } from "react";
import type { PlayerProfile } from "@tarkov/data";
import { Button, SectionTitle } from "@tarkov/ui";
import type { UseTarkovTrackerSyncResult } from "../useTarkovTrackerSync.js";

export interface ProfileReadoutProps {
  profile: PlayerProfile;
  sync: UseTarkovTrackerSyncResult;
  onEditProfile: () => void;
}

const TRADER_KEYS = [
  "prapor",
  "therapist",
  "skier",
  "peacekeeper",
  "mechanic",
  "ragman",
  "jaeger",
] as const;

const TRADER_LABEL: Record<(typeof TRADER_KEYS)[number], string> = {
  prapor: "PRAPOR",
  therapist: "THERA",
  skier: "SKIER",
  peacekeeper: "PEACE",
  mechanic: "MECH",
  ragman: "RAGMAN",
  jaeger: "JAEGER",
};

function formatRelativeTime(then: number, now = Date.now()): string {
  const ms = Math.max(0, now - then);
  const hours = Math.floor(ms / 3600_000);
  if (hours < 1) {
    const minutes = Math.max(1, Math.floor(ms / 60_000));
    return `${minutes}M AGO`;
  }
  if (hours < 48) return `${hours}H AGO`;
  const days = Math.floor(hours / 24);
  return `${days}D AGO`;
}

export function ProfileReadout({
  profile,
  sync,
  onEditProfile,
}: ProfileReadoutProps): ReactElement {
  const isSynced = sync.detail.state === "synced";
  const isSyncing = sync.detail.state === "syncing";

  const meta = isSynced
    ? `TARKOVTRACKER · ${formatRelativeTime(sync.detail.lastSyncedAt)}`
    : "MANUAL";

  return (
    <div className="flex flex-col gap-2">
      <SectionTitle index={3} title="Profile" />
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-muted-foreground)]">
        {meta}
      </div>
      <div className="grid grid-cols-3 gap-1">
        {TRADER_KEYS.map((key) => {
          const level = profile.traders?.[key] ?? 1;
          const colour = level >= 3 ? "text-[var(--color-primary)]" : "text-[var(--color-foreground)]";
          return (
            <div
              key={key}
              className="flex items-center justify-between border border-[var(--color-border)] px-1.5 py-0.5"
            >
              <span className="font-mono text-[9px] text-[var(--color-muted-foreground)]">
                {TRADER_LABEL[key]}
              </span>
              <span className={`font-mono text-[10px] font-semibold ${colour}`}>L{level}</span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            void sync.reSync();
          }}
          disabled={!isSynced || isSyncing}
          className="flex-1"
        >
          RE-IMPORT
        </Button>
        <Button size="sm" variant="ghost" onClick={onEditProfile}>
          EDIT PROFILE ▸
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tarkov/web test -- profile-readout`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/builder/optimize/profile-readout.tsx apps/web/src/features/builder/optimize/profile-readout.test.tsx
git commit -m "feat(builder): ProfileReadout for optimizer solver rail"
```

---

## Task 7: Lift `useTarkovTrackerSync` from `ProfileEditor` to `BuilderPage`

**Purpose:** Move the hook call up so `ProfileEditor` and `ProfileReadout` share one sync state machine.

**Files:**
- Modify: `apps/web/src/features/builder/profile-editor.tsx`
- Modify: `apps/web/src/routes/builder.tsx`

- [ ] **Step 1: Edit `profile-editor.tsx` — accept `sync` prop**

In `apps/web/src/features/builder/profile-editor.tsx`:
- Add `sync: UseTarkovTrackerSyncResult` to `ProfileEditorProps`.
- Remove the local `useTarkovTrackerSync({...})` call.
- Remove the `useTasks()` call if it was only used to feed the lifted hook. (Check — if `ProfileEditor` uses `tasks.data` for the quest list UI, keep `useTasks` for that purpose.)
- Use `sync` prop everywhere the local `sync` variable was used.

Show the exact diff:

```tsx
// Before
import { useTarkovTrackerSync } from "./useTarkovTrackerSync.js";
...
export interface ProfileEditorProps {
  profile: PlayerProfile;
  onChange: (next: PlayerProfile) => void;
}
...
  const sync = useTarkovTrackerSync({
    profile,
    onChange,
    tasks: tasks.data,
  });

// After
import type { UseTarkovTrackerSyncResult } from "./useTarkovTrackerSync.js";
...
export interface ProfileEditorProps {
  profile: PlayerProfile;
  onChange: (next: PlayerProfile) => void;
  sync: UseTarkovTrackerSyncResult;
}
...
export function ProfileEditor({ profile, onChange, sync }: ProfileEditorProps): ReactElement {
  // (remove the local useTarkovTrackerSync call)
```

- [ ] **Step 2: Edit `builder.tsx` — call the hook here, pass to ProfileEditor**

In `apps/web/src/routes/builder.tsx`:

Add near the other state hooks (right after `const [profile, setProfile] = useProfile();`):

```tsx
import { useTarkovTrackerSync } from "../features/builder/useTarkovTrackerSync.js";
import { useTasks } from "@tarkov/data";
...
  const tasks = useTasks();
  const sync = useTarkovTrackerSync({ profile, onChange: setProfile, tasks: tasks.data });
```

Then update the `<ProfileEditor>` usage:

```tsx
// Before
<ProfileEditor profile={profile} onChange={setProfile} />
// After
<ProfileEditor profile={profile} onChange={setProfile} sync={sync} />
```

- [ ] **Step 3: Run existing tests to verify no regression**

Run: `pnpm --filter @tarkov/web test -- profile-editor`

Expected: existing profile-editor tests still pass (they may need a `sync` mock added — follow their failure messages).

If the existing profile-editor tests don't pass a sync, add a minimal mock:

```ts
const syncMock = {
  state: "disconnected" as const,
  detail: { state: "disconnected" as const },
  connect: vi.fn(),
  reSync: vi.fn(),
  disconnect: vi.fn(),
};
// ...render(<ProfileEditor profile={profile} onChange={onChange} sync={syncMock} />);
```

Update every `render(<ProfileEditor ... />)` site in the test file.

- [ ] **Step 4: Run full typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/builder/profile-editor.tsx apps/web/src/routes/builder.tsx apps/web/src/features/builder/profile-editor.test.tsx
git commit -m "refactor(builder): lift useTarkovTrackerSync to BuilderPage for shared sync state"
```

---

## Task 8: `OptimizeView` — top-level layout + state owner

**Purpose:** Compose `OptimizeConstraintsForm` + `ProfileReadout` in a solver rail; `OptimizeTriptych` + `ModChangesTable` in the right column. Own constraints reducer, `useOptimizer`, and selection `Set<string>`.

**Files:**
- Create: `apps/web/src/features/builder/optimize/optimize-view.tsx`
- Create: `apps/web/src/features/builder/optimize/optimize-view.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/features/builder/optimize/optimize-view.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OptimizeView } from "./optimize-view.js";
import type { PlayerProfile, WeaponTree, BuildV4 } from "@tarkov/data";
import type { BallisticWeapon, WeaponSpec } from "@tarkov/ballistics";
import type { UseTarkovTrackerSyncResult } from "../useTarkovTrackerSync.js";

// Stub @tarkov/optimizer for deterministic result; also stub useOptimizer import resolved from the same module graph.
vi.mock("@tarkov/optimizer", () => ({
  optimize: () => ({
    ok: true,
    build: {
      version: 4,
      weaponId: "w1",
      attachments: { muzzle: "m-new", handguard: "h-new" },
      orphaned: [],
      createdAt: "2026-04-22T00:00:00Z",
    } satisfies BuildV4,
    stats: {
      ergonomics: 58,
      verticalRecoil: 120,
      horizontalRecoil: 260,
      weight: 3.1,
      accuracy: 2.2,
      modCount: 2,
    } as WeaponSpec,
    partial: false,
  }),
}));

const weapon = { id: "w1" } as unknown as BallisticWeapon;
const slotTree: WeaponTree = {
  weaponId: "w1",
  slots: [
    { path: "muzzle", name: "Muzzle", nameId: "muzzle", allowedItems: [] },
    { path: "handguard", name: "Handguard", nameId: "handguard", allowedItems: [] },
  ],
} as unknown as WeaponTree;
const profile: PlayerProfile = {
  mode: "basic",
  traders: { prapor: 4, therapist: 3, skier: 3, peacekeeper: 2, mechanic: 3, ragman: 2, jaeger: 3 },
  flea: true,
  completedQuests: [],
} as PlayerProfile;
const sync: UseTarkovTrackerSyncResult = {
  state: "disconnected",
  detail: { state: "disconnected" },
  connect: vi.fn(),
  reSync: vi.fn(),
  disconnect: vi.fn(),
};
const currentStats: WeaponSpec = {
  ergonomics: 50,
  verticalRecoil: 150,
  horizontalRecoil: 300,
  weight: 3.5,
  accuracy: 2.5,
  modCount: 1,
} as WeaponSpec;

describe("OptimizeView", () => {
  it("renders idle state with CURRENT filled and diff table idle message", () => {
    render(
      <OptimizeView
        weapon={weapon}
        slotTree={slotTree}
        modList={[]}
        profile={profile}
        sync={sync}
        currentAttachments={{ muzzle: "m-old" }}
        currentBuild={{
          version: 4,
          weaponId: "w1",
          attachments: { muzzle: "m-old" },
          orphaned: [],
          createdAt: "2026-04-22T00:00:00Z",
        }}
        currentStats={currentStats}
        currentPrice={10_000}
        onAccept={vi.fn()}
        onExit={vi.fn()}
        onEditProfile={vi.fn()}
      />,
    );
    expect(screen.getByText(/OPTIMIZER/)).toBeInTheDocument();
    expect(screen.getByText(/RUN THE SOLVER/)).toBeInTheDocument();
    // Current ergo populates the CURRENT card.
    expect(screen.getByTestId("triptych-current-ergo").textContent).toContain("50");
  });

  it("populates triptych and diff table after RUN OPTIMIZATION is clicked", async () => {
    render(
      <OptimizeView
        weapon={weapon}
        slotTree={slotTree}
        modList={[]}
        profile={profile}
        sync={sync}
        currentAttachments={{ muzzle: "m-old" }}
        currentBuild={{
          version: 4,
          weaponId: "w1",
          attachments: { muzzle: "m-old" },
          orphaned: [],
          createdAt: "2026-04-22T00:00:00Z",
        }}
        currentStats={currentStats}
        currentPrice={10_000}
        onAccept={vi.fn()}
        onExit={vi.fn()}
        onEditProfile={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Run optimization/i }));
    // The result state is set on the next microtask; wait one tick.
    await new Promise((r) => queueMicrotask(() => r(undefined)));
    expect(await screen.findByTestId("triptych-optimized-ergo")).toHaveTextContent("58");
  });

  it("calls onAccept with merged build when ACCEPT SELECTED fires with 1 row unchecked", async () => {
    const onAccept = vi.fn();
    render(
      <OptimizeView
        weapon={weapon}
        slotTree={slotTree}
        modList={[]}
        profile={profile}
        sync={sync}
        currentAttachments={{ muzzle: "m-old", handguard: "h-old" }}
        currentBuild={{
          version: 4,
          weaponId: "w1",
          attachments: { muzzle: "m-old", handguard: "h-old" },
          orphaned: [],
          createdAt: "2026-04-22T00:00:00Z",
        }}
        currentStats={currentStats}
        currentPrice={10_000}
        onAccept={onAccept}
        onExit={vi.fn()}
        onEditProfile={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Run optimization/i }));
    await new Promise((r) => queueMicrotask(() => r(undefined)));
    // Proposal changes both muzzle and handguard (m-new / h-new vs m-old / h-old).
    // Uncheck handguard row — expect merged build to keep h-old.
    const handguardBox = await screen.findByRole("checkbox", { name: /Accept HANDGUARD/i });
    fireEvent.click(handguardBox);
    fireEvent.click(screen.getByRole("button", { name: /ACCEPT SELECTED \(1\)/ }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onAccept.mock.calls[0][0].attachments).toEqual({ muzzle: "m-new", handguard: "h-old" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tarkov/web test -- optimize-view`
Expected: FAIL — "Cannot find module".

- [ ] **Step 3: Write implementation**

```tsx
// apps/web/src/features/builder/optimize/optimize-view.tsx
import { useEffect, useMemo, useReducer, useState, type ReactElement } from "react";
import type { BuildV4, ModListItem, PlayerProfile, WeaponTree } from "@tarkov/data";
import type { BallisticWeapon, WeaponSpec } from "@tarkov/ballistics";
import { Button, Card, Pill } from "@tarkov/ui";
import type { UseTarkovTrackerSyncResult } from "../useTarkovTrackerSync.js";
import {
  constraintsReducer,
  initialConstraintsState,
  toOptimizerInput,
} from "./optimize-constraints-reducer.js";
import { OptimizeConstraintsForm } from "./optimize-constraints-form.js";
import { useOptimizer } from "./useOptimizer.js";
import { OptimizeTriptych } from "./optimize-triptych.js";
import { ModChangesTable, type TableMode } from "./mod-changes-table.js";
import { ProfileReadout } from "./profile-readout.js";
import { slotDiff, type ChangedRow } from "./slot-diff.js";
import { buildFromSelection } from "./build-from-selection.js";

export interface OptimizeViewProps {
  weapon: BallisticWeapon;
  slotTree: WeaponTree;
  modList: readonly ModListItem[];
  profile: PlayerProfile;
  sync: UseTarkovTrackerSyncResult;
  currentAttachments: Readonly<Record<string, string>>;
  currentBuild: BuildV4;
  currentStats: WeaponSpec | null;
  currentPrice: number | null;
  onAccept: (build: BuildV4) => void;
  onExit: () => void;
  onEditProfile: () => void;
}

function sumPrice(attachments: Readonly<Record<string, string>>, modList: readonly ModListItem[]): number {
  let total = 0;
  for (const id of Object.values(attachments)) {
    const m = modList.find((x) => x.id === id);
    total += m?.price ?? 0;
  }
  return total;
}

export function OptimizeView({
  weapon,
  slotTree,
  modList,
  profile,
  sync,
  currentAttachments,
  currentBuild,
  currentStats,
  currentPrice,
  onAccept,
  onExit,
  onEditProfile,
}: OptimizeViewProps): ReactElement {
  const [state, dispatch] = useReducer(constraintsReducer, initialConstraintsState);
  const optimizer = useOptimizer();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  // Pre-fill constraints pins from the user's current build on first mount.
  useEffect(() => {
    dispatch({ type: "INIT_FROM_BUILD", attachments: currentAttachments });
    // Only on mount — deliberate empty deps. Re-mounting the view (e.g., via
    // ?view=optimize toggle) re-fires this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const proposed = optimizer.result && optimizer.result.ok ? optimizer.result : null;

  const rows: readonly ChangedRow[] = useMemo(() => {
    if (!proposed) return [];
    return slotDiff(currentAttachments, proposed.build.attachments, slotTree, modList);
  }, [proposed, currentAttachments, slotTree, modList]);

  // Default selection = all changed slots, refreshed whenever a new result arrives.
  useEffect(() => {
    if (proposed) setSelected(new Set(rows.map((r) => r.slotId)));
  }, [proposed, rows]);

  const optimizedPrice = useMemo(
    () => (proposed ? sumPrice(proposed.build.attachments, modList) : null),
    [proposed, modList],
  );
  const unchangedCount = slotTree.slots.length - rows.length;

  const mode: TableMode =
    optimizer.state === "running" ? "running" : proposed ? "result" : "idle";

  const scoreDelta = proposed && currentStats && proposed.stats ? computeScoreDelta(state.objective, currentStats, proposed.stats) : null;

  function handleRun(): void {
    optimizer.run(toOptimizerInput(state, { weapon, slotTree, modList, profile }));
  }

  function handleToggle(slotId: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slotId)) next.delete(slotId);
      else next.add(slotId);
      return next;
    });
  }

  function handleAcceptAll(): void {
    if (!proposed) return;
    onAccept(buildFromSelection(currentBuild, proposed.build, new Set(rows.map((r) => r.slotId))));
  }

  function handleAcceptSelected(): void {
    if (!proposed) return;
    onAccept(buildFromSelection(currentBuild, proposed.build, selected));
  }

  function handleDiscard(): void {
    optimizer.reset();
    onExit();
  }

  const isError = optimizer.state === "error" || (proposed === null && optimizer.result && !optimizer.result.ok);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4 border-b border-dashed border-[var(--color-border)] pb-3">
        <button
          type="button"
          onClick={onExit}
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)]"
          aria-label="Back to builder editor"
        >
          ← EDITOR
        </button>
        <h1 className="font-display text-2xl uppercase tracking-wide text-[var(--color-foreground)]">
          OPTIMIZER
        </h1>
        <Pill tone={optimizer.state === "idle" ? "muted" : optimizer.state === "running" ? "accent" : optimizer.state === "error" ? "destructive" : "reliable"}>
          {optimizer.state.toUpperCase()}
        </Pill>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
        <Card variant="bracket" className="flex flex-col gap-5 p-5">
          <div className="flex items-center justify-between">
            <span className="font-display text-base tracking-wide">SOLVER</span>
            <Pill tone="reliable">BRANCH-AND-BOUND</Pill>
          </div>
          <OptimizeConstraintsForm
            state={state}
            dispatch={dispatch}
            slotTree={slotTree}
            onRun={handleRun}
          />
          <ProfileReadout profile={profile} sync={sync} onEditProfile={onEditProfile} />
          <Button onClick={handleRun} disabled={optimizer.state === "running"}>
            RE-RUN OPTIMIZATION
          </Button>
        </Card>

        <div className="flex flex-col gap-5 min-w-0">
          {isError ? (
            <Card variant="bracket" className="p-5">
              <div className="font-display text-base">OPTIMIZER ERROR</div>
              <p className="mt-2 text-sm text-[var(--color-destructive)]">
                {optimizer.error?.message ?? "No valid build under these constraints."}
              </p>
              <Button className="mt-3" variant="secondary" onClick={() => optimizer.reset()}>
                BACK TO CONSTRAINTS
              </Button>
            </Card>
          ) : (
            <OptimizeTriptych
              current={currentStats}
              optimized={proposed?.stats ?? null}
              priceCurrent={currentPrice}
              priceOptimized={optimizedPrice}
              running={optimizer.state === "running"}
            />
          )}

          <ModChangesTable
            rows={rows}
            selected={selected}
            onToggle={handleToggle}
            onAcceptAll={handleAcceptAll}
            onAcceptSelected={handleAcceptSelected}
            onDiscard={handleDiscard}
            scoreDelta={scoreDelta}
            mode={mode}
            unchangedCount={Math.max(0, unchangedCount)}
          />
        </div>
      </div>
    </div>
  );
}

function computeScoreDelta(
  objective: string,
  current: WeaponSpec,
  proposed: WeaponSpec,
): number {
  switch (objective) {
    case "min-recoil":
      return proposed.verticalRecoil - current.verticalRecoil;
    case "max-ergonomics":
      return -(proposed.ergonomics - current.ergonomics);
    case "min-weight":
      return proposed.weight - current.weight;
    case "max-accuracy":
      return proposed.accuracy - current.accuracy;
    default:
      return 0;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tarkov/web test -- optimize-view`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/builder/optimize/optimize-view.tsx apps/web/src/features/builder/optimize/optimize-view.test.tsx
git commit -m "feat(builder): OptimizeView composes triptych + diff + solver rail"
```

---

## Task 9: Route-level `validateSearch` + view branching

**Purpose:** Add `view: "editor" | "optimize"` search param to `/builder` and `/builder/$id`; render `<OptimizeView>` when `view === "optimize"`; remove `OptimizeDialog` mount.

**Files:**
- Modify: `apps/web/src/routes/builder.tsx`
- Modify: `apps/web/src/routes/builder.$id.tsx`

- [ ] **Step 1: Edit `builder.tsx` — add validateSearch + view branch**

In `apps/web/src/routes/builder.tsx`:

Top-of-file imports, add:

```tsx
import { z } from "zod";
import { OptimizeView } from "../features/builder/optimize/optimize-view.js";
```

Remove:

```tsx
import { OptimizeDialog } from "../features/builder/optimize/optimize-dialog.js";
```

(Task 11 deletes the dialog file; the import must go now to avoid a broken import.)

Update the Route definition at line ~32:

```tsx
const builderSearchSchema = z.object({
  view: z.enum(["editor", "optimize"]).catch("editor"),
});

export const Route = createFileRoute("/builder")({
  component: BuilderRouteLayout,
  validateSearch: (s) => builderSearchSchema.parse(s),
});
```

Inside `BuilderPage`, delete `const [optimizeOpen, setOptimizeOpen] = useState(false);` and the entire `{selectedWeapon && tree.data && (<OptimizeDialog ... />)}` block.

Compute a `currentBuild` memo for `<OptimizeView>`:

```tsx
const currentBuild = useMemo<BuildV4>(
  () => ({
    version: 4,
    weaponId,
    attachments,
    orphaned,
    createdAt: new Date().toISOString(),
    ...(buildName.trim().length > 0 ? { name: buildName.trim() } : {}),
    ...(buildDescription.trim().length > 0 ? { description: buildDescription.trim() } : {}),
    ...(embedProfileOnSave ? { profileSnapshot: profile } : {}),
  }),
  [weaponId, attachments, orphaned, buildName, buildDescription, embedProfileOnSave, profile],
);

const currentPrice = useMemo(() => {
  if (!mods.data) return null;
  let total = 0;
  for (const id of Object.values(attachments)) {
    const m = mods.data.find((x) => x.id === id);
    total += m?.price ?? 0;
  }
  return total;
}, [mods.data, attachments]);
```

Read `view` from the current route search (must use the per-route call since `BuilderPage` is rendered by both `/builder` and `/builder/$id`):

The simplest path: accept `view` as a new `BuilderPageProps` field, have `BuilderRouteLayout` and `LoadedBuilderPage` (Task 9.2) each pull it via `Route.useSearch()` and pass it down.

```tsx
// BuilderPageProps
  view?: "editor" | "optimize";

// BuilderRouteLayout
function BuilderRouteLayout() {
  const matchRoute = useMatchRoute();
  const isExactBuilder = matchRoute({ to: "/builder" });
  const search = Route.useSearch();
  return isExactBuilder ? <BuilderPage view={search.view} /> : <Outlet />;
}

// BuilderPage signature
export function BuilderPage({
  // ...existing props...
  view = "editor",
}: BuilderPageProps = {}) {
```

Change the `onOptimize` callback and the `render` body:

```tsx
const handleOpenOptimizer = () =>
  navigate({ to: ".", search: (s) => ({ ...s, view: "optimize" as const }) });
const handleExitOptimizer = () =>
  navigate({ to: ".", search: (s) => ({ ...s, view: "editor" as const }) });
const handleEditProfile = () => {
  handleExitOptimizer();
  // Scroll into view once the editor renders.
  requestAnimationFrame(() => {
    document.querySelector("[data-profile-editor]")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
};

...
<BuildHeader ... onOptimize={selectedWeapon ? handleOpenOptimizer : undefined} />
```

Wrap the existing editor body in a `{view === "editor" ? ( ... ) : ( <OptimizeView ... /> )}`. The `BuildHeader` stays outside the branch (visible in both views).

```tsx
{view === "editor" ? (
  <>
    {/* existing editor body: CompareFromBuildDialog, notice, upstreamDrift, snapshot banner, ProfileEditor, error card, weapon card, PresetPicker, Mods card, Spec card */}
  </>
) : selectedWeapon && tree.data && spec ? (
  <OptimizeView
    weapon={adaptWeapon(selectedWeapon)}
    slotTree={tree.data}
    modList={mods.data ?? []}
    profile={profile}
    sync={sync}
    currentAttachments={attachments}
    currentBuild={currentBuild}
    currentStats={spec}
    currentPrice={currentPrice}
    onAccept={(build) => {
      setAttachments(build.attachments);
      setOrphaned(build.orphaned);
      handleExitOptimizer();
    }}
    onExit={handleExitOptimizer}
    onEditProfile={handleEditProfile}
  />
) : (
  <Card>
    <CardContent className="pt-6">
      <p className="text-sm">
        Pick a weapon in the editor before running the optimizer.
      </p>
      <Button className="mt-3" size="sm" onClick={handleExitOptimizer}>
        ← Back to editor
      </Button>
    </CardContent>
  </Card>
)}
```

Also mark the ProfileEditor block so the scroll-into-view works:

```tsx
<div data-profile-editor>
  <ProfileEditor profile={profile} onChange={setProfile} sync={sync} />
</div>
```

- [ ] **Step 2: Edit `builder.$id.tsx` — add the same validateSearch + pass view down**

In `apps/web/src/routes/builder.$id.tsx`:

```tsx
import { z } from "zod";
...
const builderIdSearchSchema = z.object({
  view: z.enum(["editor", "optimize"]).catch("editor"),
});

export const Route = createFileRoute("/builder/$id")({
  component: LoadedBuilderPage,
  validateSearch: (s) => builderIdSearchSchema.parse(s),
});

function LoadedBuilderPage() {
  const { id } = Route.useParams();
  const { view } = Route.useSearch();
  const query = useLoadBuild(id);
  // ...existing body...
  // In each `<BuilderPage {...commonProps} .../>` site, add `view={view}`:
  return <BuilderPage {...commonProps} view={view} initialAttachments={build.attachments} initialOrphaned={build.orphaned} />;
}
```

Do this for all four version branches (v1, v2, v3, v4).

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

If any existing e2e test failed to pass `view`, the loader's `view={view}` default (`"editor"`) handles it — `validateSearch.catch("editor")` means an unknown/missing param resolves to `"editor"`.

- [ ] **Step 4: Run vitest**

Run: `pnpm --filter @tarkov/web test`
Expected: all existing tests PASS. The new optimize-* tests pass. No regressions on profile-editor or builder tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/builder.tsx apps/web/src/routes/builder.$id.tsx
git commit -m "feat(builder): route view=optimize branches to OptimizeView"
```

---

## Task 10: `BuildHeader` — `◇ OPTIMIZE` button label

**Purpose:** Update the button label/style from `Optimize ⚙` to the mockup's `◇ OPTIMIZE`.

**Files:**
- Modify: `apps/web/src/features/builder/build-header.tsx`

- [ ] **Step 1: Edit the button label**

In `apps/web/src/features/builder/build-header.tsx`, replace:

```tsx
<Button variant="secondary" size="sm" onClick={onOptimize}>
  Optimize ⚙
</Button>
```

with:

```tsx
<Button variant="secondary" size="sm" onClick={onOptimize} className="font-mono tracking-[0.15em]">
  ◇ OPTIMIZE
</Button>
```

- [ ] **Step 2: Run vitest**

Run: `pnpm --filter @tarkov/web test -- build-header`
Expected: PASS. If an existing test asserts the old text "Optimize ⚙", update it to `◇ OPTIMIZE`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/builder/build-header.tsx apps/web/src/features/builder/build-header.test.tsx
git commit -m "feat(builder): rename BuildHeader optimize button to ◇ OPTIMIZE"
```

---

## Task 11: Delete `OptimizeDialog` + `OptimizeResultView`

**Purpose:** Retire the modal codepath. Task 9 already removed the import.

**Files:**
- Delete: `apps/web/src/features/builder/optimize/optimize-dialog.tsx`
- Delete: `apps/web/src/features/builder/optimize/optimize-result-view.tsx`
- Modify: `apps/web/src/features/builder/optimize/index.ts` (if it exists and re-exports the dialog)

- [ ] **Step 1: Check for remaining imports**

Run:
```bash
grep -rn "optimize-dialog\|OptimizeDialog\|optimize-result-view\|OptimizeResultView" apps/web/src packages/
```
Expected: zero matches (Task 9 removed the last one).

If anything matches, resolve the import first.

- [ ] **Step 2: Delete the files**

Run:
```bash
rm apps/web/src/features/builder/optimize/optimize-dialog.tsx
rm apps/web/src/features/builder/optimize/optimize-result-view.tsx
```

- [ ] **Step 3: Update index.ts re-exports if present**

Check: `cat apps/web/src/features/builder/optimize/index.ts` (if the file exists).

If present, remove any `export * from "./optimize-dialog.js"` / `export * from "./optimize-result-view.js"` lines. Add exports for the new files (Tasks 1–8):

```ts
export * from "./slot-diff.js";
export * from "./build-from-selection.js";
export * from "./optimize-triptych.js";
export * from "./mod-changes-table.js";
export * from "./profile-readout.js";
export * from "./optimize-view.js";
```

If no `index.ts` exists, skip — all imports in the codebase use the direct file paths.

- [ ] **Step 4: Run typecheck + vitest**

Run: `pnpm typecheck && pnpm --filter @tarkov/web test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/builder/optimize/
git commit -m "refactor(builder): delete OptimizeDialog and OptimizeResultView"
```

---

## Task 12: Retarget landing `TRY OPTIMIZER` button

**Purpose:** Arc 1's landing strip links `TRY OPTIMIZER` and `LEARN MORE` to `/builder`. Point `TRY OPTIMIZER` at `/builder?view=optimize` now that the view exists.

**Files:**
- Modify: `apps/web/src/routes/index.tsx`

- [ ] **Step 1: Find the TRY OPTIMIZER link**

Run:
```bash
grep -n "TRY OPTIMIZER\|LEARN MORE" apps/web/src/routes/index.tsx
```

Expected: two `<Link to="/builder">` usages.

- [ ] **Step 2: Edit the TRY OPTIMIZER link**

For the `TRY OPTIMIZER` link specifically (not `LEARN MORE`):

```tsx
// Before
<Link to="/builder" className="...">TRY OPTIMIZER</Link>
// After
<Link to="/builder" search={{ view: "optimize" }} className="...">TRY OPTIMIZER</Link>
```

Leave `LEARN MORE` pointing at `/builder` (no view param).

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS. TanStack Router infers the `search` param type from the route's `validateSearch` schema.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/index.tsx
git commit -m "feat(web): landing TRY OPTIMIZER deep-links into /builder?view=optimize"
```

---

## Task 13: E2E coverage

**Purpose:** One new Playwright spec covers the full optimizer flow.

**Files:**
- Create: `apps/web/e2e/builder-optimizer.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// apps/web/e2e/builder-optimizer.spec.ts
import { test, expect } from "@playwright/test";

/**
 * End-to-end coverage for the optimizer-first view.
 * Prereq: run `pnpm seed:build` locally first to create a fixture build.
 * In CI the seeding happens in the playwright global-setup (see webServer config).
 */
test.describe("builder optimizer diff view", () => {
  test("enter view, run, toggle a row, accept-selected merges correctly", async ({ page }) => {
    await page.goto("/builder");
    // Pick a weapon so Optimize is reachable.
    // Wait for weapons to load, then pick the first real entry.
    const select = page.locator("select").first();
    await expect(select).toBeEnabled({ timeout: 10_000 });
    const firstWeapon = await select.locator("option").nth(1).getAttribute("value");
    if (!firstWeapon) test.skip(true, "no weapons loaded in this env");
    await select.selectOption(firstWeapon!);

    // Click ◇ OPTIMIZE.
    await page.getByRole("button", { name: /◇ OPTIMIZE/i }).click();
    await expect(page).toHaveURL(/\?view=optimize/);
    await expect(page.getByRole("heading", { name: /OPTIMIZER/i })).toBeVisible();

    // Idle state.
    await expect(page.getByText(/RUN THE SOLVER/i)).toBeVisible();

    // Run it.
    await page.getByRole("button", { name: /RE-RUN OPTIMIZATION/i }).click();

    // A row appears (solver almost always finds at least one improvement on default min-recoil).
    // If not, the ZERO-CHANGE state is also valid and the next assertion becomes a skip.
    const firstRow = page.locator('[aria-label^="Accept "]').first();
    const hasRow = await firstRow.isVisible().catch(() => false);
    if (!hasRow) {
      await expect(page.getByText(/NO IMPROVEMENTS FOUND/i)).toBeVisible();
      test.skip(true, "no improvements in this solver run — not a bug");
    }

    // Uncheck the first row and check that ACCEPT SELECTED's (N) count drops by 1.
    const beforeLabel = await page.getByRole("button", { name: /ACCEPT SELECTED/ }).textContent();
    const beforeN = parseInt((beforeLabel ?? "").match(/\((\d+)\)/)?.[1] ?? "0", 10);
    await firstRow.click();
    const afterLabel = await page.getByRole("button", { name: /ACCEPT SELECTED/ }).textContent();
    const afterN = parseInt((afterLabel ?? "").match(/\((\d+)\)/)?.[1] ?? "0", 10);
    expect(afterN).toBe(beforeN - 1);

    // Accept selected → URL returns to /builder (no view param).
    await page.getByRole("button", { name: /ACCEPT SELECTED/ }).click();
    await expect(page).not.toHaveURL(/\?view=optimize/);
  });

  test("← EDITOR discards and returns to editor without merging", async ({ page }) => {
    await page.goto("/builder");
    const select = page.locator("select").first();
    await expect(select).toBeEnabled({ timeout: 10_000 });
    const firstWeapon = await select.locator("option").nth(1).getAttribute("value");
    if (!firstWeapon) test.skip(true, "no weapons loaded");
    await select.selectOption(firstWeapon!);

    await page.getByRole("button", { name: /◇ OPTIMIZE/i }).click();
    await expect(page).toHaveURL(/\?view=optimize/);

    await page.getByRole("button", { name: /← EDITOR/ }).click();
    await expect(page).not.toHaveURL(/\?view=optimize/);
    await expect(page.getByRole("heading", { name: /OPTIMIZER/i })).not.toBeVisible();
  });
});
```

- [ ] **Step 2: Run the e2e suite**

Run:
```bash
pnpm --filter @tarkov/web build
pnpm --filter @tarkov/web test:e2e
```

Expected: all tests pass, including the new `builder-optimizer.spec.ts`. If the `test.skip` fires because the solver found no improvements, rerun once — it's environment-dependent on which weapon loads first.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/builder-optimizer.spec.ts
git commit -m "test(web): e2e coverage for optimizer diff view flow"
```

---

## Task 14: Local gate + PR

**Purpose:** Full suite green, open PR, squash-merge after CI.

- [ ] **Step 1: Run the full local gate**

Run:
```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm --filter @tarkov/web test:e2e
```

Expected: every step PASS.

If any step fails, fix and recommit before proceeding. Do NOT push a broken branch.

- [ ] **Step 2: Visual walkthrough**

Run:
```bash
pnpm dev
```

Open http://localhost:5173 in a browser. Steps to exercise:
1. Landing page: click `TRY OPTIMIZER` → assert URL becomes `/builder?view=optimize`.
2. Pick a weapon, click `◇ OPTIMIZE`.
3. Verify triptych + diff table appear.
4. Click `RE-RUN OPTIMIZATION`. Verify `OPTIMIZED` + `DELTA` populate and diff rows appear.
5. Uncheck one row. Verify `ACCEPT SELECTED (N)` count updates.
6. Click `ACCEPT SELECTED`. Verify URL returns to `/builder`, and the builder's `Spec` card reflects the merged changes.
7. Re-enter optimize view. Click `← EDITOR`. Verify return to editor with no changes.
8. Shrink browser to <1024px width. Verify solver rail stacks above the right column; triptych stacks to a single column; diff table gets horizontal scroll.
9. Check DevTools console: no errors, no warnings.

- [ ] **Step 3: Push + open PR**

```bash
git push -u origin feat/builder-optimizer-diff-view

gh pr create --title "feat(builder): Arc 2 — optimizer-first diff view" --body "$(cat <<'EOF'
## Summary

- Replace modal `OptimizeDialog` with full-page `/builder?view=optimize` layout
- Solver rail (left) + CURRENT / ◇ OPTIMIZED / DELTA stat triptych + per-row accept-selectable mod-changes diff table
- `ACCEPT ALL` / `ACCEPT SELECTED (N)` / `DISCARD` footer actions
- Read-only LL grid + TarkovTracker RE-IMPORT + EDIT PROFILE ▸ link in the solver rail
- Lift `useTarkovTrackerSync` from `ProfileEditor` to `BuilderPage` so both consumers share one sync state machine
- Narrow screens reflow (solver stacks above triptych + horizontal-scroll diff table)
- Retire `OptimizeDialog` + `OptimizeResultView` entirely
- Retarget landing `TRY OPTIMIZER` to `/builder?view=optimize`

Spec: `docs/superpowers/specs/2026-04-22-builder-optimizer-diff-view-design.md`
Plan: `docs/plans/2026-04-22-builder-optimizer-diff-view-plan.md`

## Test plan

- [x] `pnpm typecheck && pnpm lint && pnpm format:check`
- [x] `pnpm test` — slot-diff, build-from-selection, triptych, mod-changes-table, profile-readout, optimize-view unit suites all green
- [x] `pnpm --filter @tarkov/web test:e2e` — new `builder-optimizer.spec.ts` green + all prior smokes still green
- [x] Visual walkthrough: landing TRY OPTIMIZER deep-links, ◇ OPTIMIZE flip, run, uncheck, accept-selected, accept-all, discard, ← EDITOR, narrow-screen reflow
- [x] DevTools console clean

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Wait for CI; squash-merge**

```bash
gh pr checks --watch
gh pr merge --squash
```

- [ ] **Step 5: Clean up worktree**

```bash
cd /mnt/c/Users/Matt/Source/TarkovGunsmith
git worktree remove .worktrees/builder-optimizer-diff-view
git branch -D feat/builder-optimizer-diff-view
git fetch origin --prune
```
