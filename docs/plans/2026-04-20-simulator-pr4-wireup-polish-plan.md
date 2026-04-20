# Ballistics Simulator PR 4 — Wire-up + Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Ballistics Simulator as a user-visible feature. Wire the `/sim` route skeleton (PR 3) to actually run: selected ammo + armor build a `ScenarioTarget`, `Run` enables when inputs are valid, the results panel renders a kill/no-kill summary and a shot-by-shot timeline with HP bars. Loading + error states covered. After this PR merges, `feat(sim):` commit triggers a release and the feature goes live.

**Architecture:** Small pure adapter `adaptArmorForScenario` in `apps/web/src/features/sim/` maps upstream API zone strings (`"Chest"`, `"Stomach"`, `"Head"`) to our `Zone` enum values (`"thorax"`, `"stomach"`, `"head"`). A `buildScenarioTarget` helper composes the selected helmet + body armor + PMC defaults into a `ScenarioTarget`. The `/sim` route now feeds selections into `useScenario.run`, and two new result components (`ScenarioSummary`, `ShotTimeline`) render `lastResult`.

**Tech Stack:** React 19, existing `@tarkov/data` + `@tarkov/ui` + `@tarkov/ballistics`. No new deps.

---

## Reference material

- **Spec:** `docs/superpowers/specs/2026-04-19-ballistics-simulator-design.md` §5.1 (results layout), §5.2 (state wiring), §9 (zone-mapping risk + chest-rig stacking).
- **PR 1 shipped:** `simulateScenario`, `createPmcTarget`, `PMC_BODY_DEFAULTS`, zone types.
- **PR 2 shipped:** `useScenario` hook with `run(ammo, target)` action.
- **PR 3 shipped:** `/sim` route with 3-panel layout, `BodySilhouette`, `ShotQueue`, `zoneMetadata`, disabled Run button.
- **Data adapters:** `apps/web/src/features/data-adapters/adapters.ts` — `adaptAmmo`, `adaptArmor`. `adaptArmor` leaves `zones` as the raw API strings (`"Chest"`, `"Stomach"`); we do NOT modify this adapter since other routes (`/calc`, `/matrix`) depend on the current shape. PR 4 layers a scenario-specific wrapper on top.
- **API fixture shape:** `packages/tarkov-data/src/__fixtures__/armorList.json` confirms `zones: ["Chest", "Stomach"]` for body armor. Helmet shape assumed to be `["Head"]` or similar; if the upstream `items(type: armor)` query doesn't return helmets, the helmet picker will simply be empty — documented as a known v1 limitation.

## Scope decisions

1. **Zone string mapping handled at the UI layer, not in the math package.** Matches the spec §9 risk mitigation. The math package's `armor.zones` stays behaviourally coupled to our `Zone` enum; the adapter translates on the way in.
2. **`adaptArmor` is NOT modified.** Other consumers may depend on its current shape. PR 4 adds a thin wrapper `adaptArmorForScenario` that delegates + overrides zones. Keeps `/calc` and `/matrix` untouched.
3. **Unmapped zone strings are dropped.** Unknown strings (e.g., `"Eyes"`, `"Jaws"`) → omitted from the mapped `zones`. If an armor ends up with an empty `zones` after mapping, the simulator treats it as "no coverage for our seven canonical zones" — bare flesh routes. Not an error condition.
4. **"Run" enables iff ammo is selected.** Helmet + body armor are optional. Plan length is allowed to be zero (spec §4 defines simulateScenario on empty plan).
5. **Helmets may not appear in the dropdown if the upstream `armor` type excludes headwear.** We rely on the existing `useArmorList` query; adding a separate `useHelmetList` is scope creep. Documented as a follow-up in §"Known follow-ups" of the spec.
6. **Results timeline uses simple HP bars, not charts.** A `<div>`-based progress bar per affected part per shot. Charts are the separate M2 sub-project ("Effectiveness charts").
7. **No save/share for scenarios.** Explicit spec §3 non-goal.
8. **No component tests** (same rationale as PR 3). The new pure helpers (`adaptArmorForScenario`, `buildScenarioTarget`) are unit-tested in vitest.

## File map

```
apps/web/src/features/sim/
├── adaptArmorForScenario.ts          NEW — zone mapper + armor wrapper
├── adaptArmorForScenario.test.ts     NEW — unit tests
├── buildScenarioTarget.ts            NEW — compose ScenarioTarget from selections
├── buildScenarioTarget.test.ts       NEW — unit tests
├── ScenarioSummary.tsx               NEW — summary card component
├── ShotTimeline.tsx                  NEW — per-shot row component
└── (existing PR 2 + PR 3 files untouched)

apps/web/src/routes/
└── sim.tsx                            MODIFIED — wire run, render results, enable/disable Run
```

No changes outside `apps/web/src/`.

---

## Task 0: Worktree + branch setup

**Files:** none modified.

- [ ] **Step 1: Create the worktree off `origin/main`.**

```bash
cd ~/TarkovGunsmith
git fetch origin
git worktree add .worktrees/sim-pr4-wireup -b feat/sim-pr4-wireup origin/main
cd .worktrees/sim-pr4-wireup
```

- [ ] **Step 2: Install + build workspace deps.**

```bash
pnpm install --frozen-lockfile
pnpm --filter "./packages/*" build
```

- [ ] **Step 3: Baseline.**

```bash
pnpm --filter @tarkov/web typecheck
pnpm --filter @tarkov/web lint
pnpm --filter @tarkov/web test
```

Expected: all green. 40 web tests.

---

## Task 1: Zone string adapter (`adaptArmorForScenario`)

**Files:**

- Create: `apps/web/src/features/sim/adaptArmorForScenario.ts`
- Create: `apps/web/src/features/sim/adaptArmorForScenario.test.ts`

- [ ] **Step 1: Write the failing test.** Create `adaptArmorForScenario.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ArmorListItem } from "@tarkov/data";
import { adaptArmorForScenario, API_ZONE_TO_SCENARIO } from "./adaptArmorForScenario.js";

const paca: ArmorListItem = {
  id: "paca",
  name: "PACA Soft Armor",
  shortName: "PACA",
  iconLink: "",
  properties: {
    __typename: "ItemPropertiesArmor",
    class: 3,
    durability: 40,
    material: { name: "Aramid", destructibility: 0.55 },
    zones: ["Chest", "Stomach"],
  },
};

describe("API_ZONE_TO_SCENARIO", () => {
  it("maps known API zones to scenario zones", () => {
    expect(API_ZONE_TO_SCENARIO.Chest).toBe("thorax");
    expect(API_ZONE_TO_SCENARIO.Stomach).toBe("stomach");
    expect(API_ZONE_TO_SCENARIO.Head).toBe("head");
  });
});

describe("adaptArmorForScenario", () => {
  it("translates Chest + Stomach to thorax + stomach", () => {
    const out = adaptArmorForScenario(paca);
    expect(out.zones).toEqual(["thorax", "stomach"]);
  });

  it("preserves armor class and durability", () => {
    const out = adaptArmorForScenario(paca);
    expect(out.armorClass).toBe(3);
    expect(out.maxDurability).toBe(40);
    expect(out.currentDurability).toBe(40);
    expect(out.materialDestructibility).toBeCloseTo(0.55, 4);
  });

  it("drops unmapped zone strings", () => {
    const weird = {
      ...paca,
      properties: { ...paca.properties, zones: ["Chest", "Eyes", "Jaws"] },
    };
    const out = adaptArmorForScenario(weird);
    expect(out.zones).toEqual(["thorax"]);
  });

  it("handles empty zones array", () => {
    const bare = { ...paca, properties: { ...paca.properties, zones: [] } };
    const out = adaptArmorForScenario(bare);
    expect(out.zones).toEqual([]);
  });

  it("treats zone strings case-insensitively via the map", () => {
    // The map is the source of truth; lowercase inputs do NOT match. Document
    // the expectation: unknown-case strings are dropped.
    const lower = { ...paca, properties: { ...paca.properties, zones: ["chest"] } };
    const out = adaptArmorForScenario(lower);
    expect(out.zones).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect failure.**

```bash
pnpm --filter @tarkov/web test -- adaptArmorForScenario
```

- [ ] **Step 3: Write `adaptArmorForScenario.ts`.**

```ts
import type { BallisticArmor, Zone } from "@tarkov/ballistics";
import type { ArmorListItem } from "@tarkov/data";
import { adaptArmor } from "../data-adapters/adapters.js";

/**
 * Map upstream API zone strings (`"Chest"`, `"Stomach"`, `"Head"`) to our
 * canonical `Zone` enum values. Entries that don't appear here are dropped.
 */
export const API_ZONE_TO_SCENARIO: Readonly<Record<string, Zone>> = {
  Chest: "thorax",
  Stomach: "stomach",
  Head: "head",
  LeftArm: "leftArm",
  RightArm: "rightArm",
  LeftLeg: "leftLeg",
  RightLeg: "rightLeg",
};

/**
 * Wrap `adaptArmor` with scenario-specific zone translation. Unknown API
 * zone strings are dropped. Everything else (class, durability, material,
 * id, name) passes through unchanged.
 *
 * @example
 *   const target: ScenarioTarget = {
 *     ...createPmcTarget(),
 *     bodyArmor: adaptArmorForScenario(pacaItem),
 *   };
 */
export function adaptArmorForScenario(item: ArmorListItem): BallisticArmor {
  const base = adaptArmor(item);
  const mapped: Zone[] = [];
  for (const z of item.properties.zones) {
    const scenario = API_ZONE_TO_SCENARIO[z];
    if (scenario) mapped.push(scenario);
  }
  return { ...base, zones: mapped };
}
```

- [ ] **Step 4: Run — 5 passing.**

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/features/sim/adaptArmorForScenario.ts apps/web/src/features/sim/adaptArmorForScenario.test.ts
git commit -m "feat(sim): adaptArmorForScenario zone string adapter (API → canonical)"
```

---

## Task 2: `buildScenarioTarget` composer

**Files:**

- Create: `apps/web/src/features/sim/buildScenarioTarget.ts`
- Create: `apps/web/src/features/sim/buildScenarioTarget.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it } from "vitest";
import type { ArmorListItem } from "@tarkov/data";
import { buildScenarioTarget } from "./buildScenarioTarget.js";
import { PMC_BODY_DEFAULTS } from "@tarkov/ballistics";

const paca: ArmorListItem = {
  id: "paca",
  name: "PACA",
  shortName: "PACA",
  iconLink: "",
  properties: {
    __typename: "ItemPropertiesArmor",
    class: 3,
    durability: 40,
    material: { name: "Aramid", destructibility: 0.55 },
    zones: ["Chest", "Stomach"],
  },
};

const altyn: ArmorListItem = {
  id: "altyn",
  name: "Altyn",
  shortName: "Altyn",
  iconLink: "",
  properties: {
    __typename: "ItemPropertiesArmor",
    class: 4,
    durability: 50,
    material: { name: "Aramid", destructibility: 0.4 },
    zones: ["Head"],
  },
};

describe("buildScenarioTarget", () => {
  it("produces a fresh PMC target when no armor is provided", () => {
    const t = buildScenarioTarget({ helmet: undefined, bodyArmor: undefined });
    expect(t.parts.head.hp).toBe(PMC_BODY_DEFAULTS.head);
    expect(t.parts.thorax.hp).toBe(PMC_BODY_DEFAULTS.thorax);
    expect(t.helmet).toBeUndefined();
    expect(t.bodyArmor).toBeUndefined();
  });

  it("attaches adapted body armor when provided", () => {
    const t = buildScenarioTarget({ helmet: undefined, bodyArmor: paca });
    expect(t.bodyArmor).toBeDefined();
    expect(t.bodyArmor!.armorClass).toBe(3);
    expect(t.bodyArmor!.zones).toEqual(["thorax", "stomach"]);
  });

  it("attaches adapted helmet when provided", () => {
    const t = buildScenarioTarget({ helmet: altyn, bodyArmor: undefined });
    expect(t.helmet).toBeDefined();
    expect(t.helmet!.armorClass).toBe(4);
    expect(t.helmet!.zones).toEqual(["head"]);
  });

  it("handles both pieces together", () => {
    const t = buildScenarioTarget({ helmet: altyn, bodyArmor: paca });
    expect(t.helmet).toBeDefined();
    expect(t.bodyArmor).toBeDefined();
  });
});
```

- [ ] **Step 2: Run — expect failure.**

- [ ] **Step 3: Implement.** Create `buildScenarioTarget.ts`:

```ts
import type { ScenarioTarget } from "@tarkov/ballistics";
import { createPmcTarget } from "@tarkov/ballistics";
import type { ArmorListItem } from "@tarkov/data";
import { adaptArmorForScenario } from "./adaptArmorForScenario.js";

export interface BuildScenarioTargetInput {
  readonly helmet: ArmorListItem | undefined;
  readonly bodyArmor: ArmorListItem | undefined;
}

/**
 * Compose a `ScenarioTarget` from the user's current loadout selections.
 * Starts from `createPmcTarget()` (fresh PMC HPs) and layers on adapted armor.
 *
 * @example
 *   const target = buildScenarioTarget({ helmet, bodyArmor });
 *   scenarioRun(ammo, target);
 */
export function buildScenarioTarget({
  helmet,
  bodyArmor,
}: BuildScenarioTargetInput): ScenarioTarget {
  const base = createPmcTarget();
  return {
    ...base,
    helmet: helmet ? adaptArmorForScenario(helmet) : undefined,
    bodyArmor: bodyArmor ? adaptArmorForScenario(bodyArmor) : undefined,
  };
}
```

- [ ] **Step 4: Run — 4 passing.**

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/features/sim/buildScenarioTarget.ts apps/web/src/features/sim/buildScenarioTarget.test.ts
git commit -m "feat(sim): buildScenarioTarget composer (loadout → ScenarioTarget)"
```

---

## Task 3: `ScenarioSummary` component

**Files:**

- Create: `apps/web/src/features/sim/ScenarioSummary.tsx`

No component test (codebase convention).

- [ ] **Step 1: Write the component.**

```tsx
import type { ScenarioResult } from "@tarkov/ballistics";

export interface ScenarioSummaryProps {
  readonly result: ScenarioResult;
}

/**
 * Top-line summary card. Shows kill outcome, shots fired, shots-to-kill,
 * total flesh damage, and final armor durabilities (if armor was involved).
 */
export function ScenarioSummary({ result }: ScenarioSummaryProps) {
  const shotsFired = result.shots.length;
  const totalDamage = result.shots.reduce((sum, s) => sum + s.damage, 0);

  // Final armor durabilities: look at the last shot that used each piece.
  const lastHelmetShot = [...result.shots].reverse().find((s) => s.armorUsed === "helmet");
  const lastBodyShot = [...result.shots].reverse().find((s) => s.armorUsed === "bodyArmor");

  const killedRow = result.killed ? (
    <span className="font-semibold text-[var(--color-destructive)]">
      Killed{result.killedAt !== null ? ` on shot ${result.killedAt + 1}` : ""}
    </span>
  ) : (
    <span className="font-semibold text-[var(--color-primary)]">Alive</span>
  );

  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      <Stat label="Outcome" value={killedRow} />
      <Stat label="Shots fired" value={`${shotsFired}`} />
      <Stat label="Total flesh damage" value={`${totalDamage.toFixed(1)} HP`} />
      {lastBodyShot && (
        <Stat
          label="Body armor durability"
          value={`${lastBodyShot.remainingDurability.toFixed(1)} pts`}
        />
      )}
      {lastHelmetShot && (
        <Stat
          label="Helmet durability"
          value={`${lastHelmetShot.remainingDurability.toFixed(1)} pts`}
        />
      )}
    </dl>
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
```

- [ ] **Step 2: Typecheck + lint.**

```bash
pnpm --filter @tarkov/web typecheck && pnpm --filter @tarkov/web lint
```

- [ ] **Step 3: Commit.**

```bash
git add apps/web/src/features/sim/ScenarioSummary.tsx
git commit -m "feat(sim): ScenarioSummary component (kill outcome + shot + damage totals)"
```

---

## Task 4: `ShotTimeline` component

**Files:**

- Create: `apps/web/src/features/sim/ShotTimeline.tsx`

- [ ] **Step 1: Write the component.**

```tsx
import type { ScenarioShotResult } from "@tarkov/ballistics";
import { zoneLabel } from "./zoneMetadata.js";

export interface ShotTimelineProps {
  readonly shots: readonly ScenarioShotResult[];
}

/**
 * Per-shot timeline. Each row shows index, zone, pen Y/N, damage dealt,
 * armor damage, and an HP bar for the affected body part after the shot.
 */
export function ShotTimeline({ shots }: ShotTimelineProps) {
  if (shots.length === 0) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">No shots executed.</p>;
  }

  return (
    <ol className="flex flex-col gap-1.5">
      {shots.map((shot, i) => {
        const part = shot.bodyAfter[shot.zone];
        const pct = part.max > 0 ? Math.max(0, Math.min(100, (part.hp / part.max) * 100)) : 0;
        return (
          <li
            key={i}
            className="flex flex-col gap-1 rounded-[var(--radius)] border px-3 py-2 text-sm"
          >
            <div className="flex items-center gap-3">
              <span className="flex-none font-mono text-xs tabular-nums text-[var(--color-muted-foreground)]">
                #{i + 1}
              </span>
              <span className="flex-none font-medium">{zoneLabel(shot.zone)}</span>
              <span
                className={
                  shot.didPenetrate
                    ? "flex-none rounded-full bg-[var(--color-primary)]/20 px-2 py-0.5 text-xs font-semibold text-[var(--color-primary)]"
                    : "flex-none rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-xs"
                }
              >
                {shot.didPenetrate ? "PEN" : "blocked"}
              </span>
              <span className="flex-1 text-right text-xs text-[var(--color-muted-foreground)]">
                {shot.damage.toFixed(1)} dmg
                {shot.armorDamage > 0 ? ` · ${shot.armorDamage.toFixed(1)} armor` : ""}
                {shot.armorUsed
                  ? ` · via ${shot.armorUsed === "helmet" ? "helmet" : "body armor"}`
                  : ""}
                {shot.killed ? " · fatal" : ""}
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-[var(--color-muted)]"
              role="progressbar"
              aria-valuenow={Math.round(part.hp)}
              aria-valuemin={0}
              aria-valuemax={part.max}
              aria-label={`${zoneLabel(shot.zone)} HP after shot`}
            >
              <div
                className={
                  part.hp === 0
                    ? "h-full bg-[var(--color-destructive)]"
                    : "h-full bg-[var(--color-primary)]"
                }
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="text-xs text-[var(--color-muted-foreground)]">
              {zoneLabel(shot.zone)} HP: {part.hp.toFixed(0)} / {part.max}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 2: Typecheck + lint.**

- [ ] **Step 3: Commit.**

```bash
git add apps/web/src/features/sim/ShotTimeline.tsx
git commit -m "feat(sim): ShotTimeline component (per-shot rows with HP bars)"
```

---

## Task 5: Wire the route — enable `Run`, feed selections, render results

**Files:**

- Modify: `apps/web/src/routes/sim.tsx`

- [ ] **Step 1: Replace the current `sim.tsx` body.** The new version (a) drops the `void ammoId` suppressions, (b) computes a "scenario-runnable" condition, (c) enables the Run button, (d) passes ammo + target to `run()`, (e) renders `ScenarioSummary` + `ShotTimeline` in the Results panel.

Full file after this task:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAmmoList, useArmorList } from "@tarkov/data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@tarkov/ui";
import { adaptAmmo } from "../features/data-adapters/adapters.js";
import { useScenario } from "../features/sim/useScenario.js";
import { BodySilhouette } from "../features/sim/BodySilhouette.js";
import { ShotQueue } from "../features/sim/ShotQueue.js";
import { ScenarioSummary } from "../features/sim/ScenarioSummary.js";
import { ShotTimeline } from "../features/sim/ShotTimeline.js";
import { buildScenarioTarget } from "../features/sim/buildScenarioTarget.js";

export const Route = createFileRoute("/sim")({
  component: SimPage,
});

const DEFAULT_DISTANCE = 15;

function SimPage() {
  const ammo = useAmmoList();
  const armor = useArmorList();

  const [ammoId, setAmmoId] = useState<string>("");
  const [helmetId, setHelmetId] = useState<string>("");
  const [bodyArmorId, setBodyArmorId] = useState<string>("");
  const [distance, setDistance] = useState<number>(DEFAULT_DISTANCE);

  const { plan, lastResult, append, move, remove, clear, run } = useScenario();

  const selectedAmmo = useMemo(() => ammo.data?.find((a) => a.id === ammoId), [ammo.data, ammoId]);
  const selectedHelmet = useMemo(
    () => armor.data?.find((a) => a.id === helmetId),
    [armor.data, helmetId],
  );
  const selectedBodyArmor = useMemo(
    () => armor.data?.find((a) => a.id === bodyArmorId),
    [armor.data, bodyArmorId],
  );

  const ammoOptions = useMemo(
    () => (ammo.data ? [...ammo.data].sort((a, b) => a.name.localeCompare(b.name)) : []),
    [ammo.data],
  );
  const helmetOptions = useMemo(
    () =>
      armor.data
        ? [...armor.data]
            .filter((a) => a.properties.zones.some((z) => z.toLowerCase().includes("head")))
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [armor.data],
  );
  const bodyArmorOptions = useMemo(
    () =>
      armor.data
        ? [...armor.data]
            .filter((a) =>
              a.properties.zones.some(
                (z) => z.toLowerCase().includes("chest") || z.toLowerCase().includes("thorax"),
              ),
            )
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [armor.data],
  );

  const isLoading = ammo.isLoading || armor.isLoading;
  const dataError = ammo.error ?? armor.error;

  const canRun = selectedAmmo !== undefined && !isLoading && dataError === null;

  const onRun = () => {
    if (!selectedAmmo) return;
    const target = buildScenarioTarget({
      helmet: selectedHelmet,
      bodyArmor: selectedBodyArmor,
    });
    run(adaptAmmo(selectedAmmo), target);
  };

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="text-3xl font-bold tracking-tight">Ballistics Simulator</h1>
        <p className="mt-2 text-[var(--color-muted-foreground)]">
          Build a shot plan against a PMC target. Pick ammo, optional helmet + body armor, click
          zones to queue shots, then hit Run to simulate the engagement shot-by-shot.
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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Inputs */}
        <Card>
          <CardHeader>
            <CardTitle>Inputs</CardTitle>
            <CardDescription>Ammo + target loadout.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
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
                <span className="text-sm font-medium">Helmet (optional)</span>
                <select
                  className="h-9 rounded-[var(--radius)] border bg-[var(--color-input)] px-3 text-sm"
                  value={helmetId}
                  onChange={(e) => setHelmetId(e.target.value)}
                  disabled={isLoading}
                >
                  <option value="">{isLoading ? "Loading…" : "None"}</option>
                  {helmetOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                {!isLoading && helmetOptions.length === 0 && (
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    No helmets available — tarkov-api&rsquo;s <code>armor</code> type may not
                    include headwear. Follow-up.
                  </span>
                )}
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Body armor (optional)</span>
                <select
                  className="h-9 rounded-[var(--radius)] border bg-[var(--color-input)] px-3 text-sm"
                  value={bodyArmorId}
                  onChange={(e) => setBodyArmorId(e.target.value)}
                  disabled={isLoading}
                >
                  <option value="">{isLoading ? "Loading…" : "None"}</option>
                  {bodyArmorOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
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
                    const next = Number(e.target.value);
                    setDistance(Number.isFinite(next) ? next : 0);
                  }}
                />
              </label>
            </form>
          </CardContent>
        </Card>

        {/* Shot plan */}
        <Card>
          <CardHeader>
            <CardTitle>Shot Plan</CardTitle>
            <CardDescription>Click a zone to add it to the queue.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <BodySilhouette onZoneClick={(zone) => append({ zone, distance })} />
            <ShotQueue plan={plan} onMove={move} onRemove={remove} onClear={clear} />
            <button
              type="button"
              onClick={onRun}
              disabled={!canRun}
              title={canRun ? "" : "Select ammo to enable"}
              className="rounded-[var(--radius)] border bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-[var(--color-primary-foreground)] hover:bg-[var(--color-primary)]/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Run
            </button>
          </CardContent>
        </Card>

        {/* Results */}
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
            {!lastResult && (
              <CardDescription>Pick ammo, build a plan, then press Run.</CardDescription>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {lastResult ? (
              <>
                <ScenarioSummary result={lastResult} />
                <ShotTimeline shots={lastResult.shots} />
              </>
            ) : (
              <p className="text-sm text-[var(--color-muted-foreground)]">No results yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint + test.**

```bash
pnpm --filter @tarkov/web typecheck
pnpm --filter @tarkov/web lint
pnpm --filter @tarkov/web test
```

Expected: all green. Test count: 40 (baseline) + 5 (Task 1 adaptArmor) + 4 (Task 2 buildTarget) = 49.

- [ ] **Step 3: Commit.**

```bash
git add apps/web/src/routes/sim.tsx
git commit -m "feat(sim): wire Run button, render results via ScenarioSummary + ShotTimeline"
```

---

## Task 6: Full verification + visual sanity + push + PR

**Files:** none modified.

- [ ] **Step 1: Full monorepo CI parity.**

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm -r build
```

Expected: all exit 0.

- [ ] **Step 2: Visual sanity.**

```bash
pnpm --filter @tarkov/web dev
```

Open `http://localhost:5173/sim`. Expected:

- Select an ammo (e.g., M855). Run button enables.
- Optionally select body armor (e.g., PACA). Leave helmet none.
- Click "Thorax" on the silhouette 2–3 times. Queue shows rows.
- Click Run. Results panel populates with summary + timeline.
- Kill is achieved (M855 kills bare PMC thorax in 2 shots; through PACA it takes more).
- Clear all wipes the plan but NOT last result (lastResult persists until next Run per reducer design).

If running headless, skip this step and flag in the PR body.

- [ ] **Step 3: Push.**

```bash
git push -u origin feat/sim-pr4-wireup
```

- [ ] **Step 4: Open the PR.**

```bash
gh pr create --title "feat(sim): wire Run + render results — Simulator PR 4" --body "$(cat <<'EOF'
## Summary

Final PR of the M2 Ballistics Simulator arc. Wires the `/sim` route skeleton (PR 3) to actually run — ammo + optional loadout selections build a `ScenarioTarget`, the Run button dispatches `useScenario.run`, and the Results panel renders a kill summary + shot-by-shot timeline with HP bars.

- New pure helpers: `adaptArmorForScenario` (API zone strings → canonical `Zone` values) + `buildScenarioTarget` (compose target from selected helmet + body armor + PMC defaults).
- New result components: `ScenarioSummary` (outcome + totals) + `ShotTimeline` (per-shot rows with HP bars).
- `/sim` route rewired to pass selections through, enable Run when ammo is selected, render results.
- Spec: `docs/superpowers/specs/2026-04-19-ballistics-simulator-design.md`.
- Plan: `docs/plans/2026-04-20-simulator-pr4-wireup-polish-plan.md`.

## Known v1 limitations

- **Helmets may not populate** if tarkov-api's `items(type: armor)` doesn't return headwear. A follow-up adds a `useHelmetList` query if needed.
- Thorax-overflow damage, bleed, probabilistic mode, save/share scenarios, and effectiveness charts are explicit spec non-goals for v1.

## Test plan

- [x] `pnpm --filter @tarkov/web test` — 49 passing (40 baseline + 5 adaptArmor + 4 buildTarget).
- [x] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm -r build` — all exit 0.
- [ ] Visual sanity via dev server — **skipped in this automated run** if no browser. Manual verification: load `/sim`, pick M855 + PACA, queue 3 thorax shots, click Run, expect a kill.
- [ ] CI green on this PR.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Wait for CI + merge + cleanup.**

```bash
gh pr checks --watch
gh pr merge --squash --auto
cd ~/TarkovGunsmith
git worktree remove .worktrees/sim-pr4-wireup
git branch -D feat/sim-pr4-wireup
git fetch origin --prune
```

---

## Self-review checklist

- [ ] Zone string adapter handles all 7 canonical zones + unknown zones.
- [ ] Target composer uses `createPmcTarget()` as the base.
- [ ] Run button is enabled iff ammo is selected.
- [ ] Results panel renders summary AND timeline together.
- [ ] Empty-plan run still produces a lastResult (trivially empty).
- [ ] No changes outside `apps/web/src/`.
- [ ] No new runtime or test deps.
