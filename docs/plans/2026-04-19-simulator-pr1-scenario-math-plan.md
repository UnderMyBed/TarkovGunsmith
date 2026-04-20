# Ballistics Simulator PR 1 — Scenario Math Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `simulateScenario` — a deterministic multi-shot engagement engine — to `@tarkov/ballistics`, with types, PMC target defaults, fixtures, and full test coverage. No `apps/web` changes in this PR.

**Architecture:** Pure-TS function in `packages/ballistics/src/scenario/`. Reuses `simulateShot` for armored shots; synthesises a bare-flesh result path inline (no sentinel armor). Walks `PlannedShot[]` in order; tracks per-body-part HP, helmet/body-armor durability, kill state. Never mutates caller inputs. Stops on head or thorax HP = 0.

**Tech Stack:** TypeScript (ESM, `.js` import suffix), Vitest, V8 coverage. No new deps.

---

## Reference material

- **Spec:** `docs/superpowers/specs/2026-04-19-ballistics-simulator-design.md` (sections §4 and §6.1 are authoritative for math + tests).
- **Package conventions:** `packages/ballistics/CLAUDE.md`. One function per file, TDD strictly, JSDoc + `@example` on every public export, 100% line / 95% branch coverage.
- **Existing math to reuse:** `simulateShot(ammo, armor, distance)` in `src/shot/simulateShot.ts`. Returns `ShotResult`. Deterministic threshold rule (penChance ≥ 0.5). Does not mutate inputs.
- **Existing types:** `BallisticAmmo`, `BallisticArmor`, `ShotResult` in `src/types.ts`.
- **Existing fixtures:** `src/__fixtures__/ammo.ts` has `PS_545`, `BP_545`, `M855`, `M995`. `src/__fixtures__/armor.ts` has `PACA_C3`, `KORD_C4`, `HEXGRID_C5`, `SLICK_C6` (zones field is `["chest", "stomach"]`).
- **Existing test style:** `src/shot/simulateBurst.test.ts` — `describe` block, `it` blocks, `toBe` / `toBeCloseTo` / `toEqual`. Inline fixture objects at top when trivial; imported fixtures when reused.

## Scope decisions

1. **Armor zone semantics.** `BallisticArmor.zones` is declared "informational" in `src/types.ts`. For scenario math it becomes behavioural: `simulateScenario` matches `shot.zone` against `armor.zones`. Existing fixtures' `["chest", "stomach"]` do NOT match our `Zone` enum — scenario tests use dedicated fixtures (see Task 3). Existing fixtures in `src/__fixtures__/` are not touched.
2. **Bare flesh path is inline.** `simulateScenario` branches on `armorUsed === null` and synthesises a `ShotResult`-shaped object directly (`didPenetrate: true`, `damage: ammo.damage`, `armorDamage: 0`, `remainingDurability: 0`, `residualPenetration: ammo.penetrationPower`). Rationale: decision (a) in spec §4.5 — keeps `simulateShot`'s contract honest.
3. **Deep-clone body snapshots** via `structuredClone`. Available in Node ≥ 17 and in Vitest. Used for `bodyAfter` in every `ScenarioShotResult`.
4. **Plan length cap = 128** enforced in the UI reducer (PR 2), not here. Math engine trusts its input.
5. **Helmet zone match rule.** Spec §4.4 step 1 says helmet applies only to `zone === "head"`. The engine still checks `zone ∈ helmet.zones` so a mis-tagged helmet won't silently absorb a thorax shot. If the zone matches neither, bare flesh.

## File map

```
packages/ballistics/src/scenario/
├── types.ts                         NEW — Zone, BodyPart, ScenarioTarget, PlannedShot, ShotPlan, ScenarioShotResult, ScenarioResult
├── defaults.ts                      NEW — PMC_BODY_DEFAULTS constant + createPmcTarget() helper
├── defaults.test.ts                 NEW — minimal assertions so defaults.ts hits 100% coverage
├── simulateScenario.ts              NEW — the engine
├── simulateScenario.test.ts         NEW — the 9 spec cases
└── __fixtures__/
    └── targets.ts                   NEW — TEST_HELMET (head), TEST_BODY_ARMOR (thorax+stomach)

packages/ballistics/src/
└── index.ts                         MODIFIED — re-export scenario public surface
```

No changes outside `packages/ballistics/`.

---

## Task 0: Worktree + branch setup

**Files:** none modified; repo-level.

- [ ] **Step 1: Create the worktree.**

```bash
cd ~/TarkovGunsmith
git fetch origin
git worktree add .worktrees/sim-pr1-scenario-math -b feat/sim-pr1-scenario-math origin/main
cd .worktrees/sim-pr1-scenario-math
```

Expected: new directory `.worktrees/sim-pr1-scenario-math/` branched off the latest `origin/main`.

- [ ] **Step 2: Install deps in the worktree.**

```bash
pnpm install --frozen-lockfile
```

Expected: completes without errors. If it warns about dev-dep mismatches, stop and investigate — do NOT skip.

- [ ] **Step 3: Baseline green.**

```bash
pnpm --filter @tarkov/ballistics typecheck
pnpm --filter @tarkov/ballistics lint
pnpm --filter @tarkov/ballistics test
```

Expected: all green. This confirms the worktree is a clean starting point.

---

## Task 1: Scenario types

**Files:**

- Create: `packages/ballistics/src/scenario/types.ts`

- [ ] **Step 1: Write `types.ts`.**

```ts
import type { ShotResult } from "../types.js";

/** The seven canonical body-part zones we model in the scenario engine. */
export type Zone = "head" | "thorax" | "stomach" | "leftArm" | "rightArm" | "leftLeg" | "rightLeg";

/** The complete list of zones, in a stable iteration order. */
export const ZONES: readonly Zone[] = [
  "head",
  "thorax",
  "stomach",
  "leftArm",
  "rightArm",
  "leftLeg",
  "rightLeg",
] as const;

/** Per-body-part HP state. */
export interface BodyPart {
  /** Current HP. Clamped to 0 when damage exceeds it. */
  readonly hp: number;
  /** Maximum HP (never changes). */
  readonly max: number;
  /** True when hp reached 0 during the scenario. */
  readonly blacked: boolean;
}

/** Target: body-part state + optional helmet + optional body armor. */
export interface ScenarioTarget {
  readonly parts: Readonly<Record<Zone, BodyPart>>;
  /** Protects zones listed in its `zones` field. v1 only `head` is honoured. */
  readonly helmet?: import("../types.js").BallisticArmor;
  /** Protects zones listed in its `zones` field. */
  readonly bodyArmor?: import("../types.js").BallisticArmor;
}

/** One planned shot in a scenario's ordered plan. */
export interface PlannedShot {
  readonly zone: Zone;
  /** Metres. Passed through to `simulateShot` (currently unused by the math). */
  readonly distance: number;
}

export type ShotPlan = readonly PlannedShot[];

/** Result of one executed shot in the scenario. Extends `ShotResult`. */
export interface ScenarioShotResult extends ShotResult {
  readonly zone: Zone;
  /** Which armor piece absorbed the shot, or null for bare flesh. */
  readonly armorUsed: "helmet" | "bodyArmor" | null;
  /** Deep-cloned body state AFTER this shot resolved. */
  readonly bodyAfter: Record<Zone, BodyPart>;
  /** True iff this shot was the fatal one. */
  readonly killed: boolean;
}

/** Scenario-level result aggregating all executed shots. */
export interface ScenarioResult {
  readonly shots: readonly ScenarioShotResult[];
  readonly killed: boolean;
  /** Index into `shots` of the fatal shot, or null. */
  readonly killedAt: number | null;
}
```

- [ ] **Step 2: Typecheck from the package.**

```bash
pnpm --filter @tarkov/ballistics typecheck
```

Expected: PASS. No output.

- [ ] **Step 3: Commit.**

```bash
git add packages/ballistics/src/scenario/types.ts
git commit -m "feat(ballistics): scenario types (Zone, ScenarioTarget, ShotPlan)"
```

---

## Task 2: PMC body-part defaults

**Files:**

- Create: `packages/ballistics/src/scenario/defaults.ts`
- Create: `packages/ballistics/src/scenario/defaults.test.ts`

- [ ] **Step 1: Write the failing test.** Create `defaults.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PMC_BODY_DEFAULTS, createPmcTarget } from "./defaults.js";
import { ZONES } from "./types.js";

describe("PMC_BODY_DEFAULTS", () => {
  it("covers all seven zones", () => {
    for (const zone of ZONES) {
      expect(PMC_BODY_DEFAULTS[zone]).toBeGreaterThan(0);
    }
  });

  it("matches canonical Tarkov PMC values", () => {
    expect(PMC_BODY_DEFAULTS.head).toBe(35);
    expect(PMC_BODY_DEFAULTS.thorax).toBe(85);
    expect(PMC_BODY_DEFAULTS.stomach).toBe(70);
    expect(PMC_BODY_DEFAULTS.leftArm).toBe(60);
    expect(PMC_BODY_DEFAULTS.rightArm).toBe(60);
    expect(PMC_BODY_DEFAULTS.leftLeg).toBe(65);
    expect(PMC_BODY_DEFAULTS.rightLeg).toBe(65);
  });
});

describe("createPmcTarget", () => {
  it("produces a target with full HP and no blacked parts", () => {
    const t = createPmcTarget();
    for (const zone of ZONES) {
      expect(t.parts[zone].hp).toBe(PMC_BODY_DEFAULTS[zone]);
      expect(t.parts[zone].max).toBe(PMC_BODY_DEFAULTS[zone]);
      expect(t.parts[zone].blacked).toBe(false);
    }
    expect(t.helmet).toBeUndefined();
    expect(t.bodyArmor).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test — expect failure.**

```bash
pnpm --filter @tarkov/ballistics test -- defaults
```

Expected: FAIL. "Cannot find module './defaults.js'".

- [ ] **Step 3: Write `defaults.ts`.**

```ts
import type { ScenarioTarget, Zone } from "./types.js";

/** Canonical PMC body-part max HP values (Tarkov). */
export const PMC_BODY_DEFAULTS: Readonly<Record<Zone, number>> = {
  head: 35,
  thorax: 85,
  stomach: 70,
  leftArm: 60,
  rightArm: 60,
  leftLeg: 65,
  rightLeg: 65,
};

/**
 * Build a fresh PMC target at full HP with no armor.
 *
 * @example
 *   const target = createPmcTarget();
 *   // target.parts.thorax.hp === 85
 */
export function createPmcTarget(): ScenarioTarget {
  const parts = {} as Record<Zone, { hp: number; max: number; blacked: boolean }>;
  for (const zone of Object.keys(PMC_BODY_DEFAULTS) as Zone[]) {
    const max = PMC_BODY_DEFAULTS[zone];
    parts[zone] = { hp: max, max, blacked: false };
  }
  return { parts };
}
```

- [ ] **Step 4: Run test again — expect pass.**

```bash
pnpm --filter @tarkov/ballistics test -- defaults
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit.**

```bash
git add packages/ballistics/src/scenario/defaults.ts packages/ballistics/src/scenario/defaults.test.ts
git commit -m "feat(ballistics): PMC body-part defaults + createPmcTarget"
```

---

## Task 3: Scenario test fixtures

**Files:**

- Create: `packages/ballistics/src/scenario/__fixtures__/targets.ts`

No test file in this task; fixtures are exercised by later tests.

- [ ] **Step 1: Write `__fixtures__/targets.ts`.**

```ts
import type { BallisticArmor } from "../../types.js";

// Source: ALTYN helmet approximation (class 4, 50 max durability, aramid ~0.4).
// SOURCE: https://escapefromtarkov.fandom.com/wiki/Altyn_bulletproof_helmet
export const TEST_HELMET: BallisticArmor = {
  id: "fixture-test-helmet",
  name: "Test Helmet (Class 4)",
  armorClass: 4,
  maxDurability: 50,
  currentDurability: 50,
  materialDestructibility: 0.4,
  zones: ["head"],
};

// Class-4 body armor protecting thorax + stomach with canonical Zone names.
// Paired with KORD_C4 values from the existing ammo fixture suite.
export const TEST_BODY_ARMOR: BallisticArmor = {
  id: "fixture-test-body-c4",
  name: "Test Body Armor (Class 4)",
  armorClass: 4,
  maxDurability: 60,
  currentDurability: 60,
  materialDestructibility: 0.5,
  zones: ["thorax", "stomach"],
};

// A class-3 body armor for lighter-penetration tests.
export const TEST_BODY_ARMOR_C3: BallisticArmor = {
  id: "fixture-test-body-c3",
  name: "Test Body Armor (Class 3)",
  armorClass: 3,
  maxDurability: 40,
  currentDurability: 40,
  materialDestructibility: 0.55,
  zones: ["thorax", "stomach"],
};
```

- [ ] **Step 2: Typecheck.**

```bash
pnpm --filter @tarkov/ballistics typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add packages/ballistics/src/scenario/__fixtures__/targets.ts
git commit -m "test(ballistics): scenario test fixtures (helmet, body armor)"
```

---

## Task 4: `simulateScenario` — empty and degenerate cases

Start the engine with the simplest paths: empty plan + already-dead target.

**Files:**

- Create: `packages/ballistics/src/scenario/simulateScenario.ts`
- Create: `packages/ballistics/src/scenario/simulateScenario.test.ts`

- [ ] **Step 1: Write the failing tests.** Create `simulateScenario.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { simulateScenario } from "./simulateScenario.js";
import { createPmcTarget } from "./defaults.js";
import { M855 } from "../__fixtures__/ammo.js";
import type { ScenarioTarget } from "./types.js";

describe("simulateScenario — degenerate inputs", () => {
  it("returns empty result for empty plan", () => {
    const result = simulateScenario(M855, createPmcTarget(), []);
    expect(result.shots).toEqual([]);
    expect(result.killed).toBe(false);
    expect(result.killedAt).toBeNull();
  });

  it("returns empty result when thorax already at 0", () => {
    const base = createPmcTarget();
    const dead: ScenarioTarget = {
      ...base,
      parts: {
        ...base.parts,
        thorax: { ...base.parts.thorax, hp: 0, blacked: true },
      },
    };
    const result = simulateScenario(M855, dead, [{ zone: "thorax", distance: 15 }]);
    expect(result.shots).toEqual([]);
    expect(result.killed).toBe(true);
    expect(result.killedAt).toBeNull();
  });

  it("returns empty result when head already at 0", () => {
    const base = createPmcTarget();
    const dead: ScenarioTarget = {
      ...base,
      parts: {
        ...base.parts,
        head: { ...base.parts.head, hp: 0, blacked: true },
      },
    };
    const result = simulateScenario(M855, dead, [{ zone: "head", distance: 15 }]);
    expect(result.shots).toEqual([]);
    expect(result.killed).toBe(true);
    expect(result.killedAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect failure.**

```bash
pnpm --filter @tarkov/ballistics test -- simulateScenario
```

Expected: FAIL. "Cannot find module './simulateScenario.js'".

- [ ] **Step 3: Write the minimal `simulateScenario.ts` to pass these three.**

```ts
import { simulateShot } from "../shot/simulateShot.js";
import type { BallisticAmmo, BallisticArmor, ShotResult } from "../types.js";
import type {
  PlannedShot,
  ScenarioResult,
  ScenarioShotResult,
  ScenarioTarget,
  Zone,
} from "./types.js";

/**
 * Simulate a multi-shot engagement deterministically. Walks `plan` in order,
 * tracking per-body-part HP and armor durability, and stops on head or thorax
 * HP = 0. Inputs are never mutated.
 *
 * @example
 *   const result = simulateScenario(m855, createPmcTarget(), [
 *     { zone: "thorax", distance: 15 },
 *     { zone: "thorax", distance: 15 },
 *   ]);
 */
export function simulateScenario(
  ammo: BallisticAmmo,
  target: ScenarioTarget,
  plan: readonly PlannedShot[],
): ScenarioResult {
  const alreadyDead = target.parts.head.hp <= 0 || target.parts.thorax.hp <= 0;
  if (alreadyDead) {
    return { shots: [], killed: true, killedAt: null };
  }
  if (plan.length === 0) {
    return { shots: [], killed: false, killedAt: null };
  }
  // Full engine lands in later tasks.
  return { shots: [], killed: false, killedAt: null };
}
```

- [ ] **Step 4: Run tests — expect pass.**

```bash
pnpm --filter @tarkov/ballistics test -- simulateScenario
```

Expected: 3 passing.

- [ ] **Step 5: Commit.**

```bash
git add packages/ballistics/src/scenario/simulateScenario.ts packages/ballistics/src/scenario/simulateScenario.test.ts
git commit -m "feat(ballistics): simulateScenario skeleton + degenerate cases"
```

---

## Task 5: Bare-flesh shot path

**Files:**

- Modify: `packages/ballistics/src/scenario/simulateScenario.ts`
- Modify: `packages/ballistics/src/scenario/simulateScenario.test.ts`

- [ ] **Step 1: Add failing tests.** Append to `simulateScenario.test.ts`:

```ts
describe("simulateScenario — bare flesh", () => {
  it("applies full ammo damage to an unarmored zone", () => {
    const result = simulateScenario(M855, createPmcTarget(), [{ zone: "leftLeg", distance: 15 }]);
    expect(result.shots).toHaveLength(1);
    const shot = result.shots[0]!;
    expect(shot.zone).toBe("leftLeg");
    expect(shot.armorUsed).toBeNull();
    expect(shot.didPenetrate).toBe(true);
    expect(shot.damage).toBe(M855.damage); // 49
    expect(shot.armorDamage).toBe(0);
    expect(shot.bodyAfter.leftLeg.hp).toBe(65 - 49);
    expect(shot.bodyAfter.leftLeg.blacked).toBe(false);
    expect(shot.killed).toBe(false);
  });

  it("marks a body part blacked when hp reaches 0", () => {
    // 2× thorax to a bare PMC with M855 (49 dmg) empties thorax (85 hp).
    const result = simulateScenario(M855, createPmcTarget(), [
      { zone: "thorax", distance: 15 },
      { zone: "thorax", distance: 15 },
    ]);
    expect(result.shots).toHaveLength(2);
    const last = result.shots[1]!;
    expect(last.bodyAfter.thorax.hp).toBe(0);
    expect(last.bodyAfter.thorax.blacked).toBe(true);
    expect(last.killed).toBe(true);
    expect(result.killed).toBe(true);
    expect(result.killedAt).toBe(1);
  });

  it("clamps hp at 0 even on overkill", () => {
    // One head shot with M855 (49 dmg) vs 35 hp bare head → clamped to 0.
    const result = simulateScenario(M855, createPmcTarget(), [{ zone: "head", distance: 15 }]);
    const shot = result.shots[0]!;
    expect(shot.bodyAfter.head.hp).toBe(0);
    expect(result.killed).toBe(true);
    expect(result.killedAt).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests — expect 3 new failures.**

```bash
pnpm --filter @tarkov/ballistics test -- simulateScenario
```

Expected: 3 FAIL, 3 PASS (the Task 4 cases still pass).

- [ ] **Step 3: Implement the engine loop with the bare-flesh path.** Replace the body of `simulateScenario` in `simulateScenario.ts` with:

```ts
export function simulateScenario(
  ammo: BallisticAmmo,
  target: ScenarioTarget,
  plan: readonly PlannedShot[],
): ScenarioResult {
  const alreadyDead = target.parts.head.hp <= 0 || target.parts.thorax.hp <= 0;
  if (alreadyDead) {
    return { shots: [], killed: true, killedAt: null };
  }
  if (plan.length === 0) {
    return { shots: [], killed: false, killedAt: null };
  }

  // Rolling mutable copies (never touch caller inputs).
  const parts: Record<Zone, { hp: number; max: number; blacked: boolean }> = {
    head: { ...target.parts.head },
    thorax: { ...target.parts.thorax },
    stomach: { ...target.parts.stomach },
    leftArm: { ...target.parts.leftArm },
    rightArm: { ...target.parts.rightArm },
    leftLeg: { ...target.parts.leftLeg },
    rightLeg: { ...target.parts.rightLeg },
  };
  let helmetDurability = target.helmet?.currentDurability ?? 0;
  let bodyArmorDurability = target.bodyArmor?.currentDurability ?? 0;

  const shots: ScenarioShotResult[] = [];
  let killed = false;
  let killedAt: number | null = null;

  for (let i = 0; i < plan.length; i++) {
    const planned = plan[i]!;
    const { zone, distance } = planned;

    const armorUsed = resolveArmorSource(zone, target);
    let shotResult: ShotResult;
    if (armorUsed === "helmet" && target.helmet) {
      const rolling: BallisticArmor = {
        ...target.helmet,
        currentDurability: helmetDurability,
      };
      shotResult = simulateShot(ammo, rolling, distance);
      helmetDurability = shotResult.remainingDurability;
    } else if (armorUsed === "bodyArmor" && target.bodyArmor) {
      const rolling: BallisticArmor = {
        ...target.bodyArmor,
        currentDurability: bodyArmorDurability,
      };
      shotResult = simulateShot(ammo, rolling, distance);
      bodyArmorDurability = shotResult.remainingDurability;
    } else {
      // Bare flesh: synthesise a full-pen, no-armor result.
      shotResult = {
        didPenetrate: true,
        damage: ammo.damage,
        armorDamage: 0,
        remainingDurability: 0,
        residualPenetration: ammo.penetrationPower,
      };
    }

    const part = parts[zone];
    part.hp = Math.max(0, part.hp - shotResult.damage);
    if (part.hp === 0) part.blacked = true;

    const fatal = (zone === "head" || zone === "thorax") && part.hp === 0;
    if (fatal) {
      killed = true;
      killedAt = i;
    }

    shots.push({
      ...shotResult,
      zone,
      armorUsed,
      bodyAfter: structuredClone(parts),
      killed: fatal,
    });

    if (fatal) break;
  }

  return { shots, killed, killedAt };
}

function resolveArmorSource(zone: Zone, target: ScenarioTarget): "helmet" | "bodyArmor" | null {
  if (
    zone === "head" &&
    target.helmet &&
    (target.helmet.zones as readonly string[]).includes(zone)
  ) {
    return "helmet";
  }
  if (target.bodyArmor && (target.bodyArmor.zones as readonly string[]).includes(zone)) {
    return "bodyArmor";
  }
  return null;
}
```

- [ ] **Step 4: Run tests — all 6 pass.**

```bash
pnpm --filter @tarkov/ballistics test -- simulateScenario
```

Expected: 6 passing.

- [ ] **Step 5: Commit.**

```bash
git add packages/ballistics/src/scenario/simulateScenario.ts packages/ballistics/src/scenario/simulateScenario.test.ts
git commit -m "feat(ballistics): bare-flesh shot path + kill detection"
```

---

## Task 6: Helmet path (head shot through helmet)

**Files:**

- Modify: `packages/ballistics/src/scenario/simulateScenario.test.ts`

Engine already supports this — these tests verify it.

- [ ] **Step 1: Add failing tests.** Append:

```ts
import { M995 } from "../__fixtures__/ammo.js";
import { TEST_HELMET, TEST_BODY_ARMOR } from "./__fixtures__/targets.js";

describe("simulateScenario — helmet", () => {
  it("routes head shots through the helmet when present and matching", () => {
    const target = { ...createPmcTarget(), helmet: TEST_HELMET };
    const result = simulateScenario(M995, target, [{ zone: "head", distance: 15 }]);
    const shot = result.shots[0]!;
    expect(shot.armorUsed).toBe("helmet");
    // M995 (pen 53) easily pens class-4 fresh helmet → full damage expected.
    expect(shot.didPenetrate).toBe(true);
    expect(shot.damage).toBe(M995.damage);
  });

  it("does not mutate the caller's helmet durability", () => {
    const target = { ...createPmcTarget(), helmet: { ...TEST_HELMET } };
    const before = target.helmet!.currentDurability;
    simulateScenario(M995, target, [
      { zone: "head", distance: 15 },
      { zone: "head", distance: 15 },
    ]);
    expect(target.helmet!.currentDurability).toBe(before);
  });

  it("leaves a non-matching helmet (zones=[]) out of the path", () => {
    const weirdHelmet = { ...TEST_HELMET, zones: [] as readonly string[] };
    const target = { ...createPmcTarget(), helmet: weirdHelmet };
    const result = simulateScenario(M995, target, [{ zone: "head", distance: 15 }]);
    expect(result.shots[0]!.armorUsed).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — all pass (engine already supports this).**

```bash
pnpm --filter @tarkov/ballistics test -- simulateScenario
```

Expected: 9 passing total.

- [ ] **Step 3: Commit.**

```bash
git add packages/ballistics/src/scenario/simulateScenario.test.ts
git commit -m "test(ballistics): helmet routing + non-mutation"
```

---

## Task 7: Body armor path + durability chain

**Files:**

- Modify: `packages/ballistics/src/scenario/simulateScenario.test.ts`

- [ ] **Step 1: Add failing tests.** Append:

```ts
describe("simulateScenario — body armor", () => {
  it("routes thorax shots through body armor when matching", () => {
    const target = { ...createPmcTarget(), bodyArmor: TEST_BODY_ARMOR };
    const result = simulateScenario(M995, target, [{ zone: "thorax", distance: 15 }]);
    expect(result.shots[0]!.armorUsed).toBe("bodyArmor");
  });

  it("chains armor durability across shots", () => {
    const target = { ...createPmcTarget(), bodyArmor: { ...TEST_BODY_ARMOR } };
    const result = simulateScenario(M995, target, [
      { zone: "thorax", distance: 15 },
      { zone: "thorax", distance: 15 },
      { zone: "thorax", distance: 15 },
    ]);
    const [a, b, c] = result.shots;
    expect(a!.remainingDurability).toBeLessThan(TEST_BODY_ARMOR.maxDurability);
    expect(b!.remainingDurability).toBeLessThanOrEqual(a!.remainingDurability);
    expect(c!.remainingDurability).toBeLessThanOrEqual(b!.remainingDurability);
  });

  it("does not mutate the caller's bodyArmor durability", () => {
    const armor = { ...TEST_BODY_ARMOR };
    const target = { ...createPmcTarget(), bodyArmor: armor };
    const before = armor.currentDurability;
    simulateScenario(M995, target, [
      { zone: "thorax", distance: 15 },
      { zone: "thorax", distance: 15 },
    ]);
    expect(armor.currentDurability).toBe(before);
  });

  it("bypasses armor on zones the armor doesn't cover (e.g. legs)", () => {
    const target = { ...createPmcTarget(), bodyArmor: TEST_BODY_ARMOR };
    const result = simulateScenario(M995, target, [{ zone: "leftLeg", distance: 15 }]);
    expect(result.shots[0]!.armorUsed).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — all pass.**

```bash
pnpm --filter @tarkov/ballistics test -- simulateScenario
```

Expected: 13 passing.

- [ ] **Step 3: Commit.**

```bash
git add packages/ballistics/src/scenario/simulateScenario.test.ts
git commit -m "test(ballistics): body armor routing + durability chain"
```

---

## Task 8: Early termination + mixed-zone + body HP immutability

**Files:**

- Modify: `packages/ballistics/src/scenario/simulateScenario.test.ts`

- [ ] **Step 1: Add failing tests.** Append:

```ts
describe("simulateScenario — termination and plan handling", () => {
  it("stops executing shots after the fatal one", () => {
    const plan = Array.from({ length: 50 }, () => ({
      zone: "thorax" as const,
      distance: 15,
    }));
    const result = simulateScenario(M855, createPmcTarget(), plan);
    expect(result.killed).toBe(true);
    expect(result.shots.length).toBeLessThan(plan.length);
    // Only the last recorded shot is marked killed.
    const killedFlags = result.shots.map((s) => s.killed);
    expect(killedFlags.filter(Boolean)).toHaveLength(1);
    expect(killedFlags[killedFlags.length - 1]).toBe(true);
  });

  it("never kills on arms / legs alone", () => {
    const plan = Array.from({ length: 100 }, () => ({
      zone: "leftLeg" as const,
      distance: 15,
    }));
    const result = simulateScenario(M855, createPmcTarget(), plan);
    expect(result.killed).toBe(false);
    expect(result.killedAt).toBeNull();
    // Leg went to zero (blacked) but no death.
    const last = result.shots[result.shots.length - 1]!;
    expect(last.bodyAfter.leftLeg.blacked).toBe(true);
  });

  it("handles mixed-zone plans picking the right armor per shot", () => {
    const target: ScenarioTarget = {
      ...createPmcTarget(),
      helmet: TEST_HELMET,
      bodyArmor: TEST_BODY_ARMOR,
    };
    const result = simulateScenario(M855, target, [
      { zone: "thorax", distance: 15 },
      { zone: "leftLeg", distance: 15 },
      { zone: "head", distance: 15 },
    ]);
    expect(result.shots[0]!.armorUsed).toBe("bodyArmor");
    expect(result.shots[1]!.armorUsed).toBeNull();
    expect(result.shots[2]!.armorUsed).toBe("helmet");
  });

  it("does not mutate the caller's body parts object", () => {
    const target = createPmcTarget();
    const snapshot = structuredClone(target.parts);
    simulateScenario(M855, target, [
      { zone: "thorax", distance: 15 },
      { zone: "leftLeg", distance: 15 },
    ]);
    expect(target.parts).toEqual(snapshot);
  });

  it("produces independent bodyAfter snapshots per shot", () => {
    const result = simulateScenario(M855, createPmcTarget(), [
      { zone: "thorax", distance: 15 },
      { zone: "thorax", distance: 15 },
    ]);
    const first = result.shots[0]!.bodyAfter.thorax.hp;
    const second = result.shots[1]!.bodyAfter.thorax.hp;
    expect(second).toBeLessThan(first);
    // First snapshot wasn't mutated by the second shot.
    expect(first).toBe(85 - M855.damage);
  });
});
```

- [ ] **Step 2: Run tests — all pass.**

```bash
pnpm --filter @tarkov/ballistics test -- simulateScenario
```

Expected: 18 passing.

- [ ] **Step 3: Commit.**

```bash
git add packages/ballistics/src/scenario/simulateScenario.test.ts
git commit -m "test(ballistics): early termination, mixed zones, immutability"
```

---

## Task 9: Re-exports + package surface

**Files:**

- Modify: `packages/ballistics/src/index.ts`

- [ ] **Step 1: Update `index.ts`.** Append the scenario surface after the existing exports:

```ts
export type {
  Zone,
  BodyPart,
  ScenarioTarget,
  PlannedShot,
  ShotPlan,
  ScenarioShotResult,
  ScenarioResult,
} from "./scenario/types.js";
export { ZONES } from "./scenario/types.js";
export { PMC_BODY_DEFAULTS, createPmcTarget } from "./scenario/defaults.js";
export { simulateScenario } from "./scenario/simulateScenario.js";
```

- [ ] **Step 2: Typecheck + lint + test.**

```bash
pnpm --filter @tarkov/ballistics typecheck
pnpm --filter @tarkov/ballistics lint
pnpm --filter @tarkov/ballistics test
```

Expected: all green.

- [ ] **Step 3: Commit.**

```bash
git add packages/ballistics/src/index.ts
git commit -m "feat(ballistics): expose scenario API from package root"
```

---

## Task 10: Coverage verification

**Files:** none modified.

- [ ] **Step 1: Run coverage.**

```bash
pnpm --filter @tarkov/ballistics test:coverage
```

Expected:

- `simulateScenario.ts`: 100% lines, 100% functions, ≥95% branches, 100% statements.
- `defaults.ts`: 100% / 100% / 100% / 100%.
- Overall package thresholds (100/100/95/100) satisfied.

- [ ] **Step 2: If coverage fails on a branch, add a targeted test rather than rewriting the code.** Common gaps:
  - A resolver branch not hit (e.g., `bodyArmor` defined but `zones` is empty). Add a test like Task 6's "non-matching helmet" but for body armor.
  - The `helmet` path matched for a non-head zone (should never happen given the resolver; gate prevents).
  - The `head` path with helmet but `helmet.zones` missing `"head"`. Add a fixture variant.

- [ ] **Step 3: Re-run coverage to confirm.**

```bash
pnpm --filter @tarkov/ballistics test:coverage
```

Expected: all thresholds green.

- [ ] **Step 4: Commit any new tests.**

```bash
git add packages/ballistics/src/scenario/
git commit -m "test(ballistics): close scenario branch coverage gaps"
```

(Skip this step if no new tests were needed.)

---

## Task 11: Full-repo verification + push + PR

**Files:** none modified.

- [ ] **Step 1: Monorepo-wide gate (matches CI).**

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm -r build
```

Expected: all green. The `build` step catches consumers that depend on the package's `dist/` output; relevant when later PRs land `apps/web` changes.

- [ ] **Step 2: Push the branch.**

```bash
git push -u origin feat/sim-pr1-scenario-math
```

- [ ] **Step 3: Open the PR.**

```bash
gh pr create --title "feat(ballistics): scenario math (simulateScenario) — Simulator PR 1" --body "$(cat <<'EOF'
## Summary

First PR of the M2 Ballistics Simulator arc (spec: `docs/superpowers/specs/2026-04-19-ballistics-simulator-design.md`).

- Adds `simulateScenario(ammo, target, plan) → ScenarioResult` in `@tarkov/ballistics`.
- Per-body-part HP tracking; kill on head or thorax HP = 0; early termination after fatal shot.
- Helmet/body-armor resolution via `armor.zones` match. Bare flesh = full ammo damage, no `simulateShot` call.
- Deterministic (reuses `simulateShot`'s threshold rule). Probabilistic mode = future.
- New public surface: `Zone`, `ZONES`, `BodyPart`, `ScenarioTarget`, `PlannedShot`, `ShotPlan`, `ScenarioShotResult`, `ScenarioResult`, `PMC_BODY_DEFAULTS`, `createPmcTarget`, `simulateScenario`.
- No `apps/web` changes; UI lands in PR 2–4.

## Test plan

- [ ] CI green (typecheck, lint, format:check, test, build).
- [ ] `pnpm --filter @tarkov/ballistics test:coverage` meets package thresholds.
- [ ] Spec §6.1 cases all covered (see `simulateScenario.test.ts`).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Wait for CI, then merge.**

```bash
gh pr checks --watch
gh pr merge --squash --auto   # or --admin if branch protection requires it
```

- [ ] **Step 5: Clean up the worktree after merge lands.**

```bash
cd ~/TarkovGunsmith
git worktree remove .worktrees/sim-pr1-scenario-math
git branch -D feat/sim-pr1-scenario-math
git fetch origin --prune
git pull --ff-only
```

---

## Self-review checklist (reviewer or executing agent)

- [ ] All spec §6.1 cases mapped to a task: thorax-only kill (T5), helmet head kill (T6), bare-leg no-kill (T8), empty plan (T4), already-dead (T4), plan longer than needed (T8), durability chain (T7), immutability (T6+T7+T8), mixed-zone (T8). ✅
- [ ] No `TBD` / `TODO` / vague requirements.
- [ ] All exported symbols have JSDoc.
- [ ] Types in tasks match `simulateScenario.ts` signature exactly.
- [ ] No `any` introduced.
- [ ] No changes outside `packages/ballistics/`.
