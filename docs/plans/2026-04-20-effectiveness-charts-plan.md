# Effectiveness Charts (`/charts`) Implementation Plan

> **For agentic workers:** superpowers:subagent-driven-development.

**Goal:** Ship `/charts` — a bar-chart view of shots-to-break across every armor for one selected ammo. Adds Recharts as a dependency. Single PR. Final M2 sub-project.

**Architecture:** Add `recharts` to `apps/web`. Pure helper `rankArmorsForAmmo(ammo, armors, shotCap, distance) → ChartRow[]` in `apps/web/src/features/charts/`. Route `/charts` composes the pickers + `<BarChart>`.

---

## Reference

- **Spec:** `docs/superpowers/specs/2026-04-20-effectiveness-charts-design.md`.
- **Math:** `simulateBurst`. Same pattern as AEC's `rankAmmos`, inverted.
- **Pattern:** `apps/web/src/routes/aec.tsx` + `rankAmmos`.

## Scope decisions

1. **Recharts 3.x.** Tree-shakable, widely used, TypeScript-friendly. No alternatives evaluated — well-known choice.
2. **One chart direction only in v1**: fix an ammo → bar per armor. Inverse (fix armor → bar per ammo) is a follow-up.
3. **Infinity rendered as a capped bar.** Use `shotCap * 3` as the visual cap; label the bar with "∞".
4. **Same classification thresholds as AEC** for consistent UX.

## File map

```
apps/web/src/features/charts/
├── rankArmorsForAmmo.ts         NEW
└── rankArmorsForAmmo.test.ts    NEW

apps/web/src/routes/
├── charts.tsx                    NEW
├── __root.tsx                    MODIFIED — nav link
├── index.tsx                     MODIFIED — landing card
└── route-tree.gen.ts             REGENERATED

apps/web/package.json             MODIFIED — add recharts dep
pnpm-lock.yaml                    MODIFIED
```

---

## Task 0: Worktree + baseline

```bash
cd /mnt/c/Users/Matt/Source/TarkovGunsmith
git fetch origin
git worktree add .worktrees/charts -b feat/effectiveness-charts origin/main
cd .worktrees/charts
pnpm install --frozen-lockfile
pnpm --filter "./packages/*" build
pnpm --filter @tarkov/web typecheck && pnpm --filter @tarkov/web lint && pnpm --filter @tarkov/web test
```

Expected: all green. 73 web tests.

---

## Task 1: Add Recharts dependency

- [ ] **Step 1: Add the dep.** From the worktree root:

```bash
pnpm --filter @tarkov/web add recharts
```

Verify it lands at `^3.x` in `apps/web/package.json`. If pnpm picks 2.x, pin via `pnpm --filter @tarkov/web add recharts@latest`.

- [ ] **Step 2: Baseline still green.**

```bash
pnpm --filter @tarkov/web typecheck && pnpm --filter @tarkov/web test
```

- [ ] **Step 3: Commit.**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "build(web): add recharts dependency"
```

---

## Task 2: `rankArmorsForAmmo` helper

**Files:**

- Create: `apps/web/src/features/charts/rankArmorsForAmmo.ts`
- Create: `apps/web/src/features/charts/rankArmorsForAmmo.test.ts`

- [ ] **Step 1: Failing tests.**

```ts
import { describe, expect, it } from "vitest";
import type { BallisticAmmo, BallisticArmor } from "@tarkov/ballistics";
import { rankArmorsForAmmo } from "./rankArmorsForAmmo.js";

const strongAmmo: BallisticAmmo = {
  id: "strong",
  name: "M995",
  penetrationPower: 53,
  damage: 49,
  armorDamagePercent: 64,
  projectileCount: 1,
};

const armors: BallisticArmor[] = [
  {
    id: "c3",
    name: "PACA",
    armorClass: 3,
    maxDurability: 40,
    currentDurability: 40,
    materialDestructibility: 0.55,
    zones: ["thorax"],
  },
  {
    id: "c4",
    name: "Kord",
    armorClass: 4,
    maxDurability: 60,
    currentDurability: 60,
    materialDestructibility: 0.5,
    zones: ["thorax"],
  },
  {
    id: "c6",
    name: "Slick",
    armorClass: 6,
    maxDurability: 80,
    currentDurability: 80,
    materialDestructibility: 0.5,
    zones: ["thorax"],
  },
];

describe("rankArmorsForAmmo", () => {
  it("returns one row per armor", () => {
    const rows = rankArmorsForAmmo(strongAmmo, armors, 30, 15);
    expect(rows).toHaveLength(3);
  });

  it("lower-class armor breaks faster than higher-class armor", () => {
    const rows = rankArmorsForAmmo(strongAmmo, armors, 30, 15);
    const shotsByArmor = Object.fromEntries(rows.map((r) => [r.armor.id, r.shotsToBreak]));
    // PACA (c3) breaks faster than Slick (c6) with M995.
    expect(shotsByArmor.c3).toBeLessThanOrEqual(shotsByArmor.c6);
  });

  it("classification respects shot cap", () => {
    const rows = rankArmorsForAmmo(strongAmmo, armors, 30, 15);
    for (const r of rows) {
      if (Number.isFinite(r.shotsToBreak) && r.shotsToBreak <= 30) {
        expect(r.classification).toBe("reliable");
      }
    }
  });

  it("preserves input armor order", () => {
    const rows = rankArmorsForAmmo(strongAmmo, armors, 30, 15);
    expect(rows.map((r) => r.armor.id)).toEqual(["c3", "c4", "c6"]);
  });

  it("empty armors returns []", () => {
    expect(rankArmorsForAmmo(strongAmmo, [], 30, 15)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect failure.**

```bash
pnpm --filter @tarkov/web test rankArmorsForAmmo
```

- [ ] **Step 3: Implement.**

```ts
import { simulateBurst } from "@tarkov/ballistics";
import type { BallisticAmmo, BallisticArmor } from "@tarkov/ballistics";

export type ChartClassification = "reliable" | "marginal" | "ineffective";

export interface ChartRow {
  readonly armor: BallisticArmor;
  readonly shotsToBreak: number;
  readonly classification: ChartClassification;
}

/**
 * Compute shots-to-break for a single ammo against a set of armors.
 * Input armor order is preserved (no sorting). Infinity indicates the
 * ammo never broke the armor within the simulation window (1000 shots).
 *
 * @example
 *   const rows = rankArmorsForAmmo(m855, allArmors, 30, 15);
 */
export function rankArmorsForAmmo(
  ammo: BallisticAmmo,
  armors: readonly BallisticArmor[],
  shotCap: number,
  distance: number,
): ChartRow[] {
  const SIM_WINDOW = 1000;
  return armors.map((armor) => {
    const results = simulateBurst(ammo, armor, SIM_WINDOW, distance);
    let breakIndex = -1;
    for (let i = 0; i < results.length; i++) {
      if (results[i]!.remainingDurability <= 0) {
        breakIndex = i;
        break;
      }
    }
    const shotsToBreak = breakIndex === -1 ? Number.POSITIVE_INFINITY : breakIndex + 1;
    const classification: ChartClassification =
      shotsToBreak <= shotCap
        ? "reliable"
        : shotsToBreak <= shotCap * 2
          ? "marginal"
          : "ineffective";
    return { armor, shotsToBreak, classification };
  });
}
```

- [ ] **Step 4: Run — 5 passing.**

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/features/charts/rankArmorsForAmmo.ts apps/web/src/features/charts/rankArmorsForAmmo.test.ts
git commit -m "feat(charts): rankArmorsForAmmo helper (ammo→armor spread)"
```

---

## Task 3: `/charts` route

**Files:**

- Create: `apps/web/src/routes/charts.tsx`

- [ ] **Step 1: Write the route.**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useAmmoList, useArmorList } from "@tarkov/data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@tarkov/ui";
import { adaptAmmo, adaptArmor } from "../features/data-adapters/adapters.js";
import { rankArmorsForAmmo, type ChartRow } from "../features/charts/rankArmorsForAmmo.js";

export const Route = createFileRoute("/charts")({
  component: ChartsPage,
});

const DEFAULT_SHOT_CAP = 30;
const DEFAULT_DISTANCE = 15;
const VISUAL_CAP_MULT = 3;

function ChartsPage() {
  const ammo = useAmmoList();
  const armor = useArmorList();

  const [ammoId, setAmmoId] = useState<string>("");
  const [shotCap, setShotCap] = useState<number>(DEFAULT_SHOT_CAP);
  const [distance, setDistance] = useState<number>(DEFAULT_DISTANCE);

  const selectedAmmo = useMemo(() => ammo.data?.find((a) => a.id === ammoId), [ammo.data, ammoId]);

  const ammoOptions = useMemo(
    () => (ammo.data ? [...ammo.data].sort((a, b) => a.name.localeCompare(b.name)) : []),
    [ammo.data],
  );

  const rows = useMemo(() => {
    if (!selectedAmmo || !armor.data) return null;
    const adaptedAmmo = adaptAmmo(selectedAmmo);
    const adaptedArmors = armor.data.map(adaptArmor);
    return rankArmorsForAmmo(adaptedAmmo, adaptedArmors, shotCap, distance);
  }, [selectedAmmo, armor.data, shotCap, distance]);

  const chartData = useMemo(() => {
    if (!rows) return null;
    const visualCap = shotCap * VISUAL_CAP_MULT;
    return rows.map((r) => ({
      name: r.armor.name,
      value: Number.isFinite(r.shotsToBreak) ? r.shotsToBreak : visualCap,
      infinite: !Number.isFinite(r.shotsToBreak),
      classification: r.classification,
    }));
  }, [rows, shotCap]);

  const isLoading = ammo.isLoading || armor.isLoading;
  const dataError = ammo.error ?? armor.error;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="text-3xl font-bold tracking-tight">Effectiveness Charts</h1>
        <p className="mt-2 text-[var(--color-muted-foreground)]">
          Visualise how an ammo stacks up across every armor. Bar height = shots to break.
          <span className="ml-1">∞ bars = never breaks within the sim window.</span>
        </p>
      </section>

      {dataError && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-[var(--color-destructive)]">
              Failed to load data: {dataError.message}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Inputs</CardTitle>
          <CardDescription>Ammo + shot cap + distance.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-3" onSubmit={(e) => e.preventDefault()}>
            <label className="flex flex-col gap-1.5 sm:col-span-3">
              <span className="text-sm font-medium">Ammo</span>
              <select
                className="h-9 rounded-[var(--radius)] border bg-[var(--color-input)] px-3 text-sm"
                value={ammoId}
                onChange={(e) => setAmmoId(e.target.value)}
                disabled={isLoading || ammoOptions.length === 0}
              >
                <option value="">{isLoading ? "Loading…" : "Select ammo…"}</option>
                {ammoOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Shot cap</span>
              <Input
                type="number"
                min={1}
                max={200}
                step={1}
                value={Number.isFinite(shotCap) ? String(shotCap) : ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setShotCap(Math.max(1, Math.min(200, Number.isFinite(n) ? n : 1)));
                }}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Distance (m)</span>
              <Input
                type="number"
                min={0}
                max={500}
                step={1}
                value={Number.isFinite(distance) ? String(distance) : ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setDistance(Number.isFinite(n) ? n : 0);
                }}
              />
            </label>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shots to break, by armor</CardTitle>
          {!chartData && <CardDescription>Pick an ammo to render the chart.</CardDescription>}
        </CardHeader>
        {chartData && (
          <CardContent>
            <div className="h-[500px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 16, right: 16, bottom: 80, left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="name"
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    interval={0}
                    tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                  />
                  <YAxis tick={{ fill: "var(--color-muted-foreground)" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius)",
                    }}
                    formatter={(value: number, _name, entry) => {
                      const row = entry?.payload as (typeof chartData)[number] | undefined;
                      return [
                        row?.infinite ? "∞ (never breaks)" : `${value} shots`,
                        "Shots to break",
                      ];
                    }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={fillForClassification(entry.classification)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex gap-4 text-xs text-[var(--color-muted-foreground)]">
              <Legend color="var(--color-primary)" label="reliable (≤ shot cap)" />
              <Legend color="#d97706" label="marginal (≤ 2× cap)" />
              <Legend color="var(--color-muted)" label="ineffective (∞ or > 2× cap)" />
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function fillForClassification(k: ChartRow["classification"]): string {
  if (k === "reliable") return "var(--color-primary)";
  if (k === "marginal") return "#d97706";
  return "var(--color-muted)";
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-3 w-3 rounded-sm"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      {label}
    </span>
  );
}
```

- [ ] **Step 2: Typecheck + lint.**

- [ ] **Step 3: Commit.**

```bash
git add apps/web/src/routes/charts.tsx
git commit -m "feat(charts): /charts route with Recharts BarChart of shots-to-break"
```

---

## Task 4: Nav + landing + regen route tree

- [ ] **Step 1: Add nav link** after `/data`:

```tsx
<Link
  to="/data"
  activeProps={{ className: "font-semibold text-[var(--color-primary)]" }}
>
  Data
</Link>
<Link
  to="/charts"
  activeProps={{ className: "font-semibold text-[var(--color-primary)]" }}
>
  Charts
</Link>
```

- [ ] **Step 2: Landing card.**

```tsx
<Link to="/charts" className="block">
  <Card className="transition-colors hover:border-[var(--color-primary)]">
    <CardHeader>
      <CardTitle>Effectiveness Charts</CardTitle>
      <CardDescription>Visual shots-to-break per armor for a chosen ammo.</CardDescription>
    </CardHeader>
    <CardContent className="text-sm text-[var(--color-muted-foreground)]">
      Bar chart with reliable / marginal / ineffective classification.
    </CardContent>
  </Card>
</Link>
```

- [ ] **Step 3: Regen route tree.**

```bash
pnpm --filter @tarkov/web exec vite build
```

- [ ] **Step 4: Commit.**

```bash
git add apps/web/src/routes/__root.tsx apps/web/src/routes/index.tsx apps/web/src/route-tree.gen.ts
git commit -m "feat(charts): nav link + landing card + regen route tree"
```

---

## Task 5: Full verification + push + PR

- [ ] **Step 1: CI parity.**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm -r build
```

Inspect bundle size output from `apps/web build` — expect SPA gzip to grow by ~30–50 kB with recharts.

- [ ] **Step 2: Push.**

```bash
git push -u origin feat/effectiveness-charts
```

- [ ] **Step 3: PR.**

```bash
gh pr create --title "feat(charts): /charts Effectiveness Charts route — M2 sub-project 5 (final)" --body "$(cat <<'EOF'
## Summary

Final M2 sub-project. Closes Milestone 2 — Parity.

- Adds `recharts` dep to `apps/web`.
- Pure helper `rankArmorsForAmmo` (5 unit tests) — inverse of AEC's `rankAmmos`.
- Route `/charts`: ammo picker + shot cap + distance → responsive BarChart of shots-to-break per armor with reliable / marginal / ineffective coloring.
- Nav link + landing card.
- Spec: `docs/superpowers/specs/2026-04-20-effectiveness-charts-design.md`.
- Plan: `docs/plans/2026-04-20-effectiveness-charts-plan.md`.

## Test plan

- [x] `pnpm --filter @tarkov/web test` — +5 new tests passing.
- [x] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm -r build` — all exit 0.
- [ ] CI green on this PR.

## Note on bundle size

Recharts adds ~30–50 kB gzip to the SPA bundle. Still well under the Cloudflare Pages free-tier limits. Monitor via `pnpm -r build` output.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Merge + cleanup.**

```bash
gh pr checks --watch
gh pr merge --squash --auto
cd /mnt/c/Users/Matt/Source/TarkovGunsmith
git worktree remove .worktrees/charts
git branch -D feat/effectiveness-charts
git fetch origin --prune
```
