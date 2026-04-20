# AEC (`/aec`) Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** `/aec` route — armor-first ammo ranking. Pick an armor, see all ammos ranked by shots-to-break ascending. Single PR.

**Architecture:** Pure helper `rankAmmos(ammos, armor, shotCap, distance) → AecRow[]` in `apps/web/src/features/aec/`. `/aec` route composes armor picker + shot cap + distance → live rerank → table. Nav link + landing card.

---

## Reference

- **Spec:** `docs/superpowers/specs/2026-04-20-aec-design.md`.
- **Math:** `simulateBurst` from `@tarkov/ballistics` (reuse per-ammo). No changes to the math package.
- **Pattern:** `apps/web/src/routes/adc.tsx` — same inputs + table structure.

## File map

```
apps/web/src/features/aec/
├── rankAmmos.ts                   NEW
└── rankAmmos.test.ts              NEW

apps/web/src/routes/
├── aec.tsx                        NEW
├── __root.tsx                     MODIFIED — nav link
├── index.tsx                      MODIFIED — landing card
└── route-tree.gen.ts              REGENERATED
```

---

## Task 0: Worktree + baseline

- [ ] **Step 1:**

```bash
cd ~/TarkovGunsmith
git fetch origin
git worktree add .worktrees/aec-route -b feat/aec-route origin/main
cd .worktrees/aec-route
pnpm install --frozen-lockfile
pnpm --filter "./packages/*" build
pnpm --filter @tarkov/web typecheck && pnpm --filter @tarkov/web lint && pnpm --filter @tarkov/web test
```

Expected: all green. 55 web tests.

---

## Task 1: `rankAmmos` pure helper

**Files:**

- Create: `apps/web/src/features/aec/rankAmmos.ts`
- Create: `apps/web/src/features/aec/rankAmmos.test.ts`

- [ ] **Step 1: Failing tests.** Create `rankAmmos.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { BallisticAmmo, BallisticArmor } from "@tarkov/ballistics";
import { rankAmmos } from "./rankAmmos.js";

const mkAmmo = (id: string, pen: number, dmg: number, adp: number): BallisticAmmo => ({
  id,
  name: id,
  penetrationPower: pen,
  damage: dmg,
  armorDamagePercent: adp,
  projectileCount: 1,
});

const class4: BallisticArmor = {
  id: "armor",
  name: "Class 4",
  armorClass: 4,
  maxDurability: 60,
  currentDurability: 60,
  materialDestructibility: 0.5,
  zones: ["thorax"],
};

describe("rankAmmos", () => {
  it("sorts by shotsToBreak ascending", () => {
    const weak = mkAmmo("weak", 21, 50, 38);
    const strong = mkAmmo("strong", 53, 49, 64);
    const medium = mkAmmo("medium", 40, 50, 50);

    const rows = rankAmmos([weak, medium, strong], class4, 30, 15);
    const ids = rows.map((r) => r.ammo.id);
    expect(ids[0]).toBe("strong"); // breaks fastest
    // "weak" should be last
    expect(ids[ids.length - 1]).toBe("weak");
  });

  it("classifies by shots-to-break vs shot cap", () => {
    const ammo = mkAmmo("a", 53, 49, 64);
    const rows = rankAmmos([ammo], class4, 30, 15);
    const row = rows[0]!;
    if (row.shotsToBreak <= 30) {
      expect(row.classification).toBe("reliable");
    }
  });

  it("sets classification=ineffective when shotsToBreak exceeds 2x cap", () => {
    const weak = mkAmmo("weak", 5, 40, 20);
    const rows = rankAmmos([weak], class4, 5, 15);
    const row = rows[0]!;
    // 5 shots @ pen 5 into class 4 almost never breaks → classification falls through.
    expect(["marginal", "ineffective"]).toContain(row.classification);
  });

  it("places Infinity shotsToBreak at the end", () => {
    const weak = mkAmmo("weak", 1, 1, 1);
    const strong = mkAmmo("strong", 53, 49, 64);
    const rows = rankAmmos([weak, strong], class4, 30, 15);
    expect(rows[0]!.ammo.id).toBe("strong");
    expect(rows[1]!.ammo.id).toBe("weak");
  });

  it("reports firstPenetrationAt correctly", () => {
    const strong = mkAmmo("strong", 53, 49, 64);
    const rows = rankAmmos([strong], class4, 30, 15);
    const row = rows[0]!;
    // M995-equivalent pens Class 4 fresh on shot 1.
    expect(row.firstPenetrationAt).toBe(0);
  });

  it("totalDamageAtBreak is the sum of damages up to and including the breaking shot", () => {
    const strong = mkAmmo("strong", 53, 49, 64);
    const rows = rankAmmos([strong], class4, 30, 15);
    const row = rows[0]!;
    if (Number.isFinite(row.shotsToBreak)) {
      expect(row.totalDamageAtBreak).toBeGreaterThan(0);
    }
  });

  it("empty ammos returns []", () => {
    expect(rankAmmos([], class4, 30, 15)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect failure.**

```bash
pnpm --filter @tarkov/web test rankAmmos
```

- [ ] **Step 3: Write `rankAmmos.ts`.**

```ts
import { simulateBurst } from "@tarkov/ballistics";
import type { BallisticAmmo, BallisticArmor } from "@tarkov/ballistics";

export type AecClassification = "reliable" | "marginal" | "ineffective";

export interface AecRow {
  readonly ammo: BallisticAmmo;
  readonly shotsToBreak: number; // Infinity if cap exceeded
  readonly firstPenetrationAt: number | null;
  readonly totalDamageAtBreak: number;
  readonly classification: AecClassification;
}

/**
 * Rank a list of ammos by how efficiently each one breaks a single armor.
 * Sorts ascending by shotsToBreak; Infinity entries fall to the end.
 *
 * Classification:
 *   shotsToBreak ≤ shotCap       → "reliable"
 *   shotsToBreak ≤ shotCap * 2   → "marginal"
 *   otherwise                    → "ineffective"
 *
 * @example
 *   const rows = rankAmmos(ammos, class4Fresh, 30, 15);
 */
export function rankAmmos(
  ammos: readonly BallisticAmmo[],
  armor: BallisticArmor,
  shotCap: number,
  distance: number,
): AecRow[] {
  const rows: AecRow[] = ammos.map((ammo) => {
    const capPlusPadding = Math.max(1, Math.min(1000, Math.floor(shotCap * 2)));
    const results = simulateBurst(ammo, armor, capPlusPadding, distance);
    let firstPenetrationAt: number | null = null;
    let breakIndex = -1;
    let totalDamage = 0;
    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      totalDamage += r.damage;
      if (firstPenetrationAt === null && r.didPenetrate) firstPenetrationAt = i;
      if (breakIndex === -1 && r.remainingDurability <= 0) {
        breakIndex = i;
        break;
      }
    }
    const shotsToBreak = breakIndex === -1 ? Number.POSITIVE_INFINITY : breakIndex + 1;
    const totalDamageAtBreak = breakIndex === -1 ? 0 : totalDamage;
    const classification: AecClassification =
      shotsToBreak <= shotCap
        ? "reliable"
        : shotsToBreak <= shotCap * 2
          ? "marginal"
          : "ineffective";
    return { ammo, shotsToBreak, firstPenetrationAt, totalDamageAtBreak, classification };
  });
  rows.sort((a, b) => a.shotsToBreak - b.shotsToBreak);
  return rows;
}
```

- [ ] **Step 4: Run — all 7 tests pass.**

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/features/aec/rankAmmos.ts apps/web/src/features/aec/rankAmmos.test.ts
git commit -m "feat(aec): rankAmmos helper (shots-to-break ranking + classification)"
```

---

## Task 2: `/aec` route

**Files:**

- Create: `apps/web/src/routes/aec.tsx`

- [ ] **Step 1: Write the route.**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAmmoList, useArmorList } from "@tarkov/data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@tarkov/ui";
import { adaptAmmo, adaptArmor } from "../features/data-adapters/adapters.js";
import { rankAmmos, type AecClassification } from "../features/aec/rankAmmos.js";

export const Route = createFileRoute("/aec")({
  component: AecPage,
});

const DEFAULT_SHOT_CAP = 30;
const DEFAULT_DISTANCE = 15;

function AecPage() {
  const ammo = useAmmoList();
  const armor = useArmorList();

  const [armorId, setArmorId] = useState<string>("");
  const [shotCap, setShotCap] = useState<number>(DEFAULT_SHOT_CAP);
  const [distance, setDistance] = useState<number>(DEFAULT_DISTANCE);

  const selectedArmor = useMemo(
    () => armor.data?.find((a) => a.id === armorId),
    [armor.data, armorId],
  );

  const armorOptions = useMemo(
    () => (armor.data ? [...armor.data].sort((a, b) => a.name.localeCompare(b.name)) : []),
    [armor.data],
  );

  const rows = useMemo(() => {
    if (!selectedArmor || !ammo.data) return null;
    const adaptedArmor = adaptArmor(selectedArmor);
    const adaptedAmmos = ammo.data.map(adaptAmmo);
    return rankAmmos(adaptedAmmos, adaptedArmor, shotCap, distance);
  }, [selectedArmor, ammo.data, shotCap, distance]);

  const isLoading = ammo.isLoading || armor.isLoading;
  const dataError = ammo.error ?? armor.error;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="text-3xl font-bold tracking-tight">Armor Effectiveness Calculator</h1>
        <p className="mt-2 text-[var(--color-muted-foreground)]">
          Pick an armor; every ammo is simulated and ranked by how efficiently it breaks it.
          Classifications: <strong>reliable</strong> (≤ cap), <strong>marginal</strong> (≤ 2× cap),
          <strong> ineffective</strong> (never breaks within 2× cap).
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
          <CardDescription>Armor picker + shot cap + distance.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-3" onSubmit={(e) => e.preventDefault()}>
            <label className="flex flex-col gap-1.5 sm:col-span-3">
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
          <CardTitle>Ranked ammo</CardTitle>
          {!rows && <CardDescription>Pick an armor to rank every ammo.</CardDescription>}
        </CardHeader>
        {rows && (
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                    <th className="py-2">#</th>
                    <th className="py-2">Ammo</th>
                    <th className="py-2">Shots to break</th>
                    <th className="py-2">First pen</th>
                    <th className="py-2">Damage at break</th>
                    <th className="py-2">Classification</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.ammo.id} className="border-b last:border-b-0">
                      <td className="py-1.5 font-mono tabular-nums">{i + 1}</td>
                      <td className="py-1.5">{r.ammo.name}</td>
                      <td className="py-1.5 tabular-nums">
                        {Number.isFinite(r.shotsToBreak) ? r.shotsToBreak : "∞"}
                      </td>
                      <td className="py-1.5 tabular-nums">
                        {r.firstPenetrationAt === null ? "never" : r.firstPenetrationAt + 1}
                      </td>
                      <td className="py-1.5 tabular-nums">
                        {r.totalDamageAtBreak === 0 ? "—" : r.totalDamageAtBreak.toFixed(0)}
                      </td>
                      <td className="py-1.5">
                        <ClassificationPill k={r.classification} />
                      </td>
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

function ClassificationPill({ k }: { k: AecClassification }) {
  if (k === "reliable") {
    return (
      <span className="rounded-full bg-[var(--color-primary)]/20 px-2 py-0.5 text-xs font-semibold text-[var(--color-primary)]">
        reliable
      </span>
    );
  }
  if (k === "marginal") {
    return (
      <span className="rounded-full bg-amber-600/20 px-2 py-0.5 text-xs font-semibold text-amber-500">
        marginal
      </span>
    );
  }
  return (
    <span className="rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-xs">ineffective</span>
  );
}
```

- [ ] **Step 2: Typecheck + lint.**

- [ ] **Step 3: Commit.**

```bash
git add apps/web/src/routes/aec.tsx
git commit -m "feat(aec): /aec route with live ammo ranking table"
```

---

## Task 3: Nav + landing + regen route tree

**Files:**

- Modify: `apps/web/src/routes/__root.tsx`
- Modify: `apps/web/src/routes/index.tsx`
- Regenerate: `apps/web/src/route-tree.gen.ts`

- [ ] **Step 1: Add nav link** after `/adc`:

```tsx
<Link
  to="/adc"
  activeProps={{ className: "font-semibold text-[var(--color-primary)]" }}
>
  ADC
</Link>
<Link
  to="/aec"
  activeProps={{ className: "font-semibold text-[var(--color-primary)]" }}
>
  AEC
</Link>
```

- [ ] **Step 2: Add landing card** next to ADC card:

```tsx
<Link to="/aec" className="block">
  <Card className="transition-colors hover:border-[var(--color-primary)]">
    <CardHeader>
      <CardTitle>Armor Effectiveness</CardTitle>
      <CardDescription>Pick an armor — see every ammo ranked by shots-to-break.</CardDescription>
    </CardHeader>
    <CardContent className="text-sm text-[var(--color-muted-foreground)]">
      Inverse view: the armor is fixed; ammos are ranked reliable / marginal / ineffective.
    </CardContent>
  </Card>
</Link>
```

- [ ] **Step 3: Regenerate route tree via vite.** The repo-level `pnpm build` script is `tsc --noEmit && vite build`, which fails before regen. Bypass by invoking vite directly:

```bash
pnpm --filter @tarkov/web exec vite build
```

Inspect `route-tree.gen.ts` for the new `/aec` entry.

- [ ] **Step 4: Commit.**

```bash
git add apps/web/src/routes/__root.tsx apps/web/src/routes/index.tsx apps/web/src/route-tree.gen.ts
git commit -m "feat(aec): add /aec nav link + landing card + regen route tree"
```

---

## Task 4: Full verification + push + PR

- [ ] **Step 1: CI parity.**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm -r build
```

- [ ] **Step 2: Push.**

```bash
git push -u origin feat/aec-route
```

- [ ] **Step 3: PR.**

```bash
gh pr create --title "feat(aec): /aec route — Armor Effectiveness Calculator (M2 sub-project 3)" --body "$(cat <<'EOF'
## Summary

Third M2 sub-project. Armor-first ammo ranking. Pick an armor; every ammo is simulated and ranked by shots-to-break ascending, classified as reliable / marginal / ineffective.

- Pure helper `rankAmmos` — 7 unit tests (ordering, Infinity handling, classification boundaries, first-pen, damage-at-break).
- Route `apps/web/src/routes/aec.tsx` with armor picker + shot cap + distance inputs and a live-recompute ranking table.
- Nav link + landing card.
- Spec: `docs/superpowers/specs/2026-04-20-aec-design.md`.
- Plan: `docs/plans/2026-04-20-aec-route-plan.md`.

## Test plan

- [x] `pnpm --filter @tarkov/web test` — +7 new passing.
- [x] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm -r build` — all exit 0.
- [ ] CI green on this PR.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Merge + cleanup.**

```bash
gh pr checks --watch
gh pr merge --squash --auto
cd ~/TarkovGunsmith
git worktree remove .worktrees/aec-route
git branch -D feat/aec-route
git fetch origin --prune
```
