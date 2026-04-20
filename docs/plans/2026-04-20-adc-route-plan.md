# ADC (`/adc`) Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Ship `/adc` — multi-shot forward ballistics against a single armor piece with a per-shot result table. Single PR. No new math.

**Architecture:** `apps/web/src/routes/adc.tsx` composes ammo picker + armor picker + shots + distance + durability override, feeds `simulateBurst` via `adaptAmmo` / `adaptArmor`, renders a summary card + per-shot table. Pure-helper `adcSummary(results, armor)` computes first-pen index and totals. Nav link + landing card.

**Tech Stack:** Existing only.

---

## Reference material

- **Spec:** `docs/superpowers/specs/2026-04-20-adc-design.md`.
- **Math:** `simulateBurst(ammo, armor, shots, distance)` from `@tarkov/ballistics`. Already used by `simulateScenario`; no change needed.
- **Adapters:** `adaptAmmo`, `adaptArmor` from `apps/web/src/features/data-adapters/adapters.ts`.
- **Pattern reference:** `apps/web/src/routes/calc.tsx` for layout, picker styling, useMemo flow.

## Scope decisions

1. **Shot cap 50.** Arbitrary upper bound; anything more is implausible for a single burst. Form `max={50}` on the input; no reducer enforcement needed (local state).
2. **Durability override is optional.** Empty → use armor's maxDurability. When set, ensures min 0, max = maxDurability.
3. **"First penetration" helper surfaces index-or-null.** `null` when no shot penetrates in the burst — show "never penetrates" in the summary.
4. **No component tests.** Pure helper is unit-tested. UI is verified via typecheck + lint + manual browser check.

## File map

```
apps/web/src/features/adc/
├── adcSummary.ts                  NEW — pure summary helper
└── adcSummary.test.ts             NEW — unit tests

apps/web/src/routes/
├── adc.tsx                         NEW — /adc route
├── __root.tsx                      MODIFIED — add nav link
├── index.tsx                       MODIFIED — add landing card
└── route-tree.gen.ts               REGENERATED
```

---

## Task 0: Worktree + baseline

- [ ] **Step 1:**

```bash
cd /mnt/c/Users/Matt/Source/TarkovGunsmith
git fetch origin
git worktree add .worktrees/adc-route -b feat/adc-route origin/main
cd .worktrees/adc-route
pnpm install --frozen-lockfile
pnpm --filter "./packages/*" build
```

- [ ] **Step 2: Baseline green.**

```bash
pnpm --filter @tarkov/web typecheck && pnpm --filter @tarkov/web lint && pnpm --filter @tarkov/web test
```

Expected: all green. Test count ≈ 50.

---

## Task 1: `adcSummary` pure helper

**Files:**

- Create: `apps/web/src/features/adc/adcSummary.ts`
- Create: `apps/web/src/features/adc/adcSummary.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it } from "vitest";
import type { ShotResult } from "@tarkov/ballistics";
import { adcSummary } from "./adcSummary.js";

const shot = (dmg: number, pen: boolean, rem: number, armorDmg = 5): ShotResult => ({
  didPenetrate: pen,
  damage: dmg,
  armorDamage: armorDmg,
  remainingDurability: rem,
  residualPenetration: 30,
});

describe("adcSummary", () => {
  it("sums total flesh damage across all shots", () => {
    const out = adcSummary([shot(20, false, 35), shot(20, false, 30), shot(40, true, 25)], 40);
    expect(out.totalDamage).toBe(80);
  });

  it("reports firstPenetrationAt as the zero-based index of the first penetrating shot", () => {
    const out = adcSummary([shot(5, false, 35), shot(10, false, 30), shot(40, true, 25)], 40);
    expect(out.firstPenetrationAt).toBe(2);
  });

  it("returns firstPenetrationAt=null when no shot penetrates", () => {
    const out = adcSummary([shot(5, false, 35), shot(10, false, 30)], 40);
    expect(out.firstPenetrationAt).toBeNull();
  });

  it("final durability reflects the last shot's remainingDurability", () => {
    const out = adcSummary([shot(5, false, 35), shot(5, false, 20)], 40);
    expect(out.finalDurability).toBe(20);
  });

  it("empty results returns zeros and null firstPen", () => {
    const out = adcSummary([], 40);
    expect(out.totalDamage).toBe(0);
    expect(out.firstPenetrationAt).toBeNull();
    expect(out.finalDurability).toBe(40);
  });
});
```

- [ ] **Step 2: Run — expect failure.**

```bash
pnpm --filter @tarkov/web test -- adcSummary
```

- [ ] **Step 3: Write `adcSummary.ts`.**

```ts
import type { ShotResult } from "@tarkov/ballistics";

export interface AdcSummary {
  /** Sum of ShotResult.damage across all shots (flesh damage dealt). */
  readonly totalDamage: number;
  /** Zero-based index of the first penetrating shot, or null if none. */
  readonly firstPenetrationAt: number | null;
  /** `remainingDurability` of the last shot, or `maxDurability` if empty. */
  readonly finalDurability: number;
}

/**
 * Aggregate a simulateBurst ShotResult[] into top-line ADC metrics.
 *
 * @example
 *   const results = simulateBurst(m855, paca, 5, 15);
 *   const { totalDamage, firstPenetrationAt } = adcSummary(results, paca.maxDurability);
 */
export function adcSummary(results: readonly ShotResult[], maxDurability: number): AdcSummary {
  let totalDamage = 0;
  let firstPenetrationAt: number | null = null;
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    totalDamage += r.damage;
    if (firstPenetrationAt === null && r.didPenetrate) {
      firstPenetrationAt = i;
    }
  }
  const finalDurability =
    results.length > 0 ? results[results.length - 1]!.remainingDurability : maxDurability;
  return { totalDamage, firstPenetrationAt, finalDurability };
}
```

- [ ] **Step 4: Run — 5 passing.**

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/features/adc/adcSummary.ts apps/web/src/features/adc/adcSummary.test.ts
git commit -m "feat(adc): adcSummary pure helper (totals + first-pen index)"
```

---

## Task 2: `/adc` route

**Files:**

- Create: `apps/web/src/routes/adc.tsx`

- [ ] **Step 1: Write `adc.tsx`.**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAmmoList, useArmorList } from "@tarkov/data";
import { simulateBurst } from "@tarkov/ballistics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@tarkov/ui";
import { adaptAmmo, adaptArmor } from "../features/data-adapters/adapters.js";
import { adcSummary } from "../features/adc/adcSummary.js";

export const Route = createFileRoute("/adc")({
  component: AdcPage,
});

const DEFAULT_SHOTS = 5;
const DEFAULT_DISTANCE = 15;
const MAX_SHOTS = 50;

function AdcPage() {
  const ammo = useAmmoList();
  const armor = useArmorList();

  const [ammoId, setAmmoId] = useState<string>("");
  const [armorId, setArmorId] = useState<string>("");
  const [shots, setShots] = useState<number>(DEFAULT_SHOTS);
  const [distance, setDistance] = useState<number>(DEFAULT_DISTANCE);
  const [durabilityOverride, setDurabilityOverride] = useState<string>("");

  const selectedAmmo = useMemo(() => ammo.data?.find((a) => a.id === ammoId), [ammo.data, ammoId]);
  const selectedArmor = useMemo(
    () => armor.data?.find((a) => a.id === armorId),
    [armor.data, armorId],
  );

  const ammoOptions = useMemo(
    () => (ammo.data ? [...ammo.data].sort((a, b) => a.name.localeCompare(b.name)) : []),
    [ammo.data],
  );
  const armorOptions = useMemo(
    () => (armor.data ? [...armor.data].sort((a, b) => a.name.localeCompare(b.name)) : []),
    [armor.data],
  );

  const results = useMemo(() => {
    if (!selectedAmmo || !selectedArmor) return null;
    const adaptedArmor = adaptArmor(selectedArmor);
    const current = parseDurability(durabilityOverride, adaptedArmor.maxDurability);
    return simulateBurst(
      adaptAmmo(selectedAmmo),
      { ...adaptedArmor, currentDurability: current },
      shots,
      distance,
    );
  }, [selectedAmmo, selectedArmor, shots, distance, durabilityOverride]);

  const summary = useMemo(
    () =>
      results && selectedArmor ? adcSummary(results, selectedArmor.properties.durability) : null,
    [results, selectedArmor],
  );

  const isLoading = ammo.isLoading || armor.isLoading;
  const dataError = ammo.error ?? armor.error;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="text-3xl font-bold tracking-tight">Armor Damage Calculator</h1>
        <p className="mt-2 text-[var(--color-muted-foreground)]">
          Multi-shot forward ballistics at a single armor piece. Pick ammo, armor, and shot count;
          live-recompute shows a shot-by-shot table.
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
          <CardDescription>Live recompute on every change.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
            <label className="flex flex-col gap-1.5">
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
              <span className="text-sm font-medium">Armor</span>
              <select
                className="h-9 rounded-[var(--radius)] border bg-[var(--color-input)] px-3 text-sm"
                value={armorId}
                onChange={(e) => setArmorId(e.target.value)}
                disabled={isLoading || armorOptions.length === 0}
              >
                <option value="">{isLoading ? "Loading…" : "Select armor…"}</option>
                {armorOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Shots</span>
              <Input
                type="number"
                min={1}
                max={MAX_SHOTS}
                step={1}
                value={Number.isFinite(shots) ? String(shots) : ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  const clamped = Math.max(1, Math.min(MAX_SHOTS, Number.isFinite(n) ? n : 1));
                  setShots(clamped);
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

            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-sm font-medium">
                Starting durability (optional — defaults to max)
              </span>
              <Input
                type="number"
                min={0}
                step={1}
                value={durabilityOverride}
                placeholder={selectedArmor ? String(selectedArmor.properties.durability) : ""}
                onChange={(e) => setDurabilityOverride(e.target.value)}
              />
            </label>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
          {!results && (
            <CardDescription>Pick an ammo and an armor to see the burst.</CardDescription>
          )}
        </CardHeader>
        {results && selectedArmor && summary && (
          <CardContent className="flex flex-col gap-4">
            <dl className="grid gap-2 sm:grid-cols-2">
              <Stat
                label="First penetration"
                value={
                  summary.firstPenetrationAt === null
                    ? "never penetrates"
                    : `shot ${summary.firstPenetrationAt + 1}`
                }
              />
              <Stat label="Total flesh damage" value={`${summary.totalDamage.toFixed(1)} HP`} />
              <Stat
                label="Final durability"
                value={`${summary.finalDurability.toFixed(2)} / ${selectedArmor.properties.durability}`}
              />
              <Stat
                label="Final durability %"
                value={`${((summary.finalDurability / selectedArmor.properties.durability) * 100).toFixed(0)}%`}
              />
            </dl>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                    <th className="py-2">#</th>
                    <th className="py-2">Pen</th>
                    <th className="py-2">Damage</th>
                    <th className="py-2">Armor dmg</th>
                    <th className="py-2">Durability</th>
                    <th className="py-2">Residual pen</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="py-1.5 font-mono tabular-nums">{i + 1}</td>
                      <td className="py-1.5">
                        {r.didPenetrate ? (
                          <span className="rounded-full bg-[var(--color-primary)]/20 px-2 py-0.5 text-xs font-semibold text-[var(--color-primary)]">
                            PEN
                          </span>
                        ) : (
                          <span className="rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-xs">
                            blocked
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 tabular-nums">{r.damage.toFixed(1)}</td>
                      <td className="py-1.5 tabular-nums">{r.armorDamage.toFixed(2)}</td>
                      <td className="py-1.5 tabular-nums">{r.remainingDurability.toFixed(2)}</td>
                      <td className="py-1.5 tabular-nums">{r.residualPenetration}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[var(--radius)] border p-3">
      <dt className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
        {label}
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

function parseDurability(override: string, fallback: number): number {
  if (override.trim() === "") return fallback;
  const n = Number(override);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(fallback, n);
}
```

- [ ] **Step 2: Typecheck + lint.**

```bash
pnpm --filter @tarkov/web typecheck && pnpm --filter @tarkov/web lint
```

- [ ] **Step 3: Commit.**

```bash
git add apps/web/src/routes/adc.tsx
git commit -m "feat(adc): /adc route with live burst simulation + per-shot table"
```

---

## Task 3: Nav + landing card + regen route tree

**Files:**

- Modify: `apps/web/src/routes/__root.tsx`
- Modify: `apps/web/src/routes/index.tsx`
- Regenerate: `apps/web/src/route-tree.gen.ts`

- [ ] **Step 1: Add `/adc` nav link** in `__root.tsx` after the `/sim` link, before `/builder`:

```tsx
<Link
  to="/sim"
  activeProps={{ className: "font-semibold text-[var(--color-primary)]" }}
>
  Sim
</Link>
<Link
  to="/adc"
  activeProps={{ className: "font-semibold text-[var(--color-primary)]" }}
>
  ADC
</Link>
<Link
  to="/builder"
  activeProps={{ className: "font-semibold text-[var(--color-primary)]" }}
>
  Builder
</Link>
```

- [ ] **Step 2: Add landing card** in `index.tsx` near the Simulator card:

```tsx
<Link to="/adc" className="block">
  <Card className="transition-colors hover:border-[var(--color-primary)]">
    <CardHeader>
      <CardTitle>Armor Damage Calculator</CardTitle>
      <CardDescription>
        Multi-shot burst at a single armor piece — shot-by-shot breakdown.
      </CardDescription>
    </CardHeader>
    <CardContent className="text-sm text-[var(--color-muted-foreground)]">
      Pick ammo + armor, set shot count, see pen / damage / durability per shot.
    </CardContent>
  </Card>
</Link>
```

- [ ] **Step 3: Regenerate route tree.** `pnpm --filter @tarkov/web build` invokes vite which runs the router plugin:

```bash
pnpm --filter @tarkov/web build
```

- [ ] **Step 4: Commit.**

```bash
git add apps/web/src/routes/__root.tsx apps/web/src/routes/index.tsx apps/web/src/route-tree.gen.ts
git commit -m "feat(adc): add /adc nav link + landing card + regen route tree"
```

---

## Task 4: Full verification + push + PR

- [ ] **Step 1: CI parity.**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm -r build
```

All exit 0.

- [ ] **Step 2: Push.**

```bash
git push -u origin feat/adc-route
```

- [ ] **Step 3: Open PR.**

```bash
gh pr create --title "feat(adc): /adc route — Armor Damage Calculator (M2 sub-project 2)" --body "$(cat <<'EOF'
## Summary

Second M2 sub-project. Ships `/adc`: multi-shot forward ballistics at a single armor piece with per-shot table + summary. Uses existing `simulateBurst` math; single PR, no new deps.

- New helper `adcSummary` (total damage, first-pen index, final durability) — unit-tested.
- New route `apps/web/src/routes/adc.tsx` with inputs + results table.
- Nav link + landing card.
- Spec: `docs/superpowers/specs/2026-04-20-adc-design.md`.
- Plan: `docs/plans/2026-04-20-adc-route-plan.md`.

## Test plan

- [x] `pnpm --filter @tarkov/web test` — all passing (+5 new).
- [x] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm -r build` — all exit 0.
- [ ] CI green on this PR.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Wait for CI + merge + cleanup.**

```bash
gh pr checks --watch
gh pr merge --squash --auto
cd /mnt/c/Users/Matt/Source/TarkovGunsmith
git worktree remove .worktrees/adc-route
git branch -D feat/adc-route
git fetch origin --prune
```
