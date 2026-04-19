# `packages/ballistics` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `packages/ballistics` — a pure-TypeScript library exposing the four ballistic/armor calculations from the design spec (`simulateShot`, `simulateBurst`, `armorEffectiveness`, `weaponSpec`) plus the helpers they compose from. 100% TDD, zero runtime dependencies, fully self-contained input types.

**Architecture:** Pure functions of typed inputs. No game data hardcoded inside the package — callers pass in `BallisticAmmo`/`BallisticArmor`/`BallisticWeapon`/`BallisticMod` objects shaped by the data layer. Math formulas come from the well-documented [EFT Ballistics wiki](https://escapefromtarkov.fandom.com/wiki/Ballistics) and [Ratstash](https://github.com/RatScanner/RatStash) (the original `WishGranter` C# library). Files split by domain (`shot/`, `armor/`, `weapon/`) with one function per file alongside its `.test.ts`.

**Tech Stack:** TypeScript 6, Vitest 4, no runtime deps. Package name `@tarkov/ballistics`. Lives at `packages/ballistics/` in the pnpm workspace.

---

## File map (what exists at the end of this plan)

```
packages/ballistics/
├── CLAUDE.md                       Per-package agent guide
├── README.md                       Brief usage example
├── package.json                    @tarkov/ballistics, scripts: build, lint, test, typecheck
├── tsconfig.json                   Extends ../../tsconfig.base.json
├── vitest.config.ts                Inherits root coverage config
└── src/
    ├── index.ts                    Public API barrel
    ├── types.ts                    All input/output type definitions
    ├── shot/
    │   ├── simulateShot.ts         Single-shot simulation
    │   ├── simulateShot.test.ts
    │   ├── simulateBurst.ts        Multi-shot scenario simulation
    │   └── simulateBurst.test.ts
    ├── armor/
    │   ├── penetrationChance.ts    Pure penetration probability
    │   ├── penetrationChance.test.ts
    │   ├── armorDamage.ts          Durability degradation per shot
    │   ├── armorDamage.test.ts
    │   ├── effectiveDamage.ts      Damage after armor mitigation
    │   ├── effectiveDamage.test.ts
    │   ├── armorEffectiveness.ts   Ammo-vs-armor matrix
    │   └── armorEffectiveness.test.ts
    ├── weapon/
    │   ├── weaponSpec.ts           Aggregate weapon+mods stats
    │   └── weaponSpec.test.ts
    └── __fixtures__/
        ├── ammo.ts                 Sample ammo entries
        ├── armor.ts                Sample armor entries
        └── weapons.ts              Sample weapon + mod entries
```

---

## Phase 1: Package skeleton

### Task 1: Scaffold `packages/ballistics/` directory and `package.json`

**Files:**
- Create: `packages/ballistics/package.json`

- [ ] **Step 1: Create the directory and `package.json`**

```bash
mkdir -p packages/ballistics/src/{shot,armor,weapon,__fixtures__}
```

Create `packages/ballistics/package.json` with EXACTLY this content:

```json
{
  "name": "@tarkov/ballistics",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "Pure-TS ballistic and armor math for the TarkovGunsmith rebuild. No game data; all inputs are typed args.",
  "license": "MIT",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint . --max-warnings 0",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

- [ ] **Step 2: Verify the workspace picks it up**

Run from repo root:
```bash
pnpm install
```

Expected: pnpm reports a new workspace package and writes the `node_modules/@tarkov/ballistics` symlink. Exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/ballistics/package.json pnpm-lock.yaml
git commit -m "feat(ballistics): scaffold package"
```

This `feat:` commit will trigger a minor bump from release-please (0.1.0 → 0.2.0) at the end of the plan.

---

### Task 2: TypeScript and Vitest config

**Files:**
- Create: `packages/ballistics/tsconfig.json`
- Create: `packages/ballistics/vitest.config.ts`

- [ ] **Step 1: Create `packages/ballistics/tsconfig.json`** with EXACTLY:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "tsBuildInfoFile": ".tsbuildinfo"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "**/*.test.ts"]
}
```

- [ ] **Step 2: Create `packages/ballistics/vitest.config.ts`** with EXACTLY:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/__fixtures__/**", "src/index.ts", "src/types.ts"],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 95,
        statements: 100,
      },
    },
  },
});
```

- [ ] **Step 3: Verify typecheck passes (no source files yet)**

```bash
pnpm --filter @tarkov/ballistics typecheck
```

Expected: TypeScript reports `error TS18003: No inputs were found in config file` because `src/` is empty. That's expected for now; we'll add `src/index.ts` in Task 3 and re-verify.

- [ ] **Step 4: Commit**

```bash
git add packages/ballistics/tsconfig.json packages/ballistics/vitest.config.ts
git commit -m "feat(ballistics): add tsconfig and vitest config"
```

---

### Task 3: Type interfaces and empty barrel

**Files:**
- Create: `packages/ballistics/src/types.ts`
- Create: `packages/ballistics/src/index.ts`

- [ ] **Step 1: Create `packages/ballistics/src/types.ts`** with EXACTLY:

```ts
/**
 * Input describing a single ammunition entry — only the fields the math
 * functions actually need. Adapt from `tarkov-api` data at the call site.
 */
export interface BallisticAmmo {
  /** Stable identifier (e.g. tarkov-api `id`). */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /** Penetration power (0–80 typical). */
  readonly penetrationPower: number;
  /** Base flesh damage per round. */
  readonly damage: number;
  /** Armor damage modifier as a percentage (0–100). */
  readonly armorDamagePercent: number;
  /** Number of projectiles per shot (1 for non-shotguns). */
  readonly projectileCount: number;
}

/**
 * Input describing a single armor entry.
 */
export interface BallisticArmor {
  readonly id: string;
  readonly name: string;
  /** Armor class 1–6 (Tarkov scale). */
  readonly armorClass: number;
  /** Maximum durability points when fresh. */
  readonly maxDurability: number;
  /** Current durability — caller passes the live value. */
  readonly currentDurability: number;
  /** Material modifier; affects armor damage taken. Default 1.0. */
  readonly materialDestructibility: number;
  /** Effective protection zones (chest, head, etc.). Informational; not used in math. */
  readonly zones: readonly string[];
}

/**
 * Result of a single shot.
 */
export interface ShotResult {
  /** Did the round penetrate the armor? */
  readonly didPenetrate: boolean;
  /** Damage dealt to the body (after armor mitigation if not penetrated). */
  readonly damage: number;
  /** Durability points removed from the armor. */
  readonly armorDamage: number;
  /** Armor durability after the shot. */
  readonly remainingDurability: number;
  /** Effective penetration power after armor reduction (informational). */
  readonly residualPenetration: number;
}

/**
 * Minimum weapon stats needed to aggregate with mods.
 */
export interface BallisticWeapon {
  readonly id: string;
  readonly name: string;
  readonly baseErgonomics: number;
  /** Vertical recoil base value. */
  readonly baseVerticalRecoil: number;
  /** Horizontal recoil base value. */
  readonly baseHorizontalRecoil: number;
  readonly baseWeight: number;
  /** Base accuracy (MOA-equivalent). Lower is better. */
  readonly baseAccuracy: number;
}

/**
 * Modification (sight, grip, suppressor, etc.). All deltas are added to the
 * weapon's base stats. Multipliers (e.g. recoil reduction) apply after sums.
 */
export interface BallisticMod {
  readonly id: string;
  readonly name: string;
  /** Flat ergonomics delta (+/-). */
  readonly ergonomicsDelta: number;
  /** Recoil multiplier as a percentage (e.g. -8 means -8% recoil). */
  readonly recoilModifierPercent: number;
  /** Weight in kg. */
  readonly weight: number;
  /** Accuracy delta (negative is better). */
  readonly accuracyDelta: number;
}

/**
 * Aggregated weapon + mods specification.
 */
export interface WeaponSpec {
  readonly weaponId: string;
  readonly modCount: number;
  readonly ergonomics: number;
  readonly verticalRecoil: number;
  readonly horizontalRecoil: number;
  readonly weight: number;
  readonly accuracy: number;
}
```

- [ ] **Step 2: Create `packages/ballistics/src/index.ts`** with EXACTLY:

```ts
export type {
  BallisticAmmo,
  BallisticArmor,
  ShotResult,
  BallisticWeapon,
  BallisticMod,
  WeaponSpec,
} from "./types.js";
```

- [ ] **Step 3: Verify typecheck passes**

```bash
pnpm --filter @tarkov/ballistics typecheck
```

Expected: exit 0, no output.

- [ ] **Step 4: Verify root lint also picks up the new package files**

```bash
pnpm exec eslint packages/ballistics --max-warnings 0
```

Expected: exit 0, no output.

- [ ] **Step 5: Commit**

```bash
git add packages/ballistics/src/types.ts packages/ballistics/src/index.ts
git commit -m "feat(ballistics): add type interfaces and barrel"
```

---

### Task 4: Per-package `CLAUDE.md` and `README.md`

**Files:**
- Create: `packages/ballistics/CLAUDE.md`
- Create: `packages/ballistics/README.md`

- [ ] **Step 1: Create `packages/ballistics/CLAUDE.md`** with EXACTLY:

````markdown
# `@tarkov/ballistics`

Pure-TypeScript math for ballistic and armor calculations. Used by `apps/web` (and potentially Workers) to compute damage, penetration, durability, and weapon stats from typed inputs.

## What's in this package

- `simulateShot(ammo, armor, distance)` → `ShotResult`
- `simulateBurst(ammo, armor, shots, distance)` → `ShotResult[]`
- `armorEffectiveness(ammos, armors)` → `number[][]` (shots-to-penetrate matrix)
- `weaponSpec(weapon, mods)` → `WeaponSpec`
- Helpers: `penetrationChance`, `armorDamage`, `effectiveDamage`

## Conventions

- **Pure functions only.** Same inputs → same outputs. No globals, no `Math.random()` (pass an RNG explicitly if needed).
- **No game data hardcoded.** All ammo/armor/weapon stats are arguments. Adapt from `tarkov-api` at the call site.
- **One function per file**, alongside its `.test.ts`. Files split by domain: `shot/`, `armor/`, `weapon/`.
- **TDD strictly.** Write the test first; commit the failing test; then implement.
- **JSDoc every public function** with one `@example`.
- **Coverage:** 100% lines/functions/statements, 95% branches.

## How to add a new function

Use the `add-calc-function` project skill. It scaffolds the test file with required fixture cases and the implementation stub.

## Cross-checking against the original

Where possible, compare outputs against [Ratstash / WishGranter](https://github.com/RatScanner/RatStash) and the [EFT wiki](https://escapefromtarkov.fandom.com/wiki/Ballistics). Annotate fixtures with `// SOURCE: <link or commit>` so the `ballistics-verifier` subagent can use them.

## Out of scope

- Fetching game data (that's `@tarkov/data`).
- React components or UI (that's `apps/web`).
- Caching or memoization — callers handle that with TanStack Query or `useMemo`.
````

- [ ] **Step 2: Create `packages/ballistics/README.md`** with EXACTLY:

````markdown
# @tarkov/ballistics

Pure-TS ballistic and armor math for the TarkovGunsmith rebuild.

## Install

Workspace-internal — consumed via pnpm workspace protocol:

```jsonc
// in another workspace package
{
  "dependencies": {
    "@tarkov/ballistics": "workspace:*"
  }
}
```

## Use

```ts
import { simulateShot, type BallisticAmmo, type BallisticArmor } from "@tarkov/ballistics";

const ammo: BallisticAmmo = { /* ... */ };
const armor: BallisticArmor = { /* ... */ };

const result = simulateShot(ammo, armor, /* distance */ 15);
console.log(result.didPenetrate, result.damage);
```

## Develop

```bash
pnpm --filter @tarkov/ballistics test
pnpm --filter @tarkov/ballistics test:watch
pnpm --filter @tarkov/ballistics test:coverage
```

See [`CLAUDE.md`](./CLAUDE.md) for conventions.
````

- [ ] **Step 3: Verify format check passes**

```bash
pnpm exec prettier --check packages/ballistics
```

If any file fails, run `pnpm exec prettier --write packages/ballistics` and inspect the diff.

- [ ] **Step 4: Commit**

```bash
git add packages/ballistics/CLAUDE.md packages/ballistics/README.md
git commit -m "docs(ballistics): add per-package CLAUDE.md and README"
```

---

## Phase 2: Core math (TDD)

### Task 5: `penetrationChance` — pure penetration probability

Computes the probability that a single round penetrates a piece of armor, given the ammo's penetration power, the armor's class, and its current durability.

**Formula** (community-derived, matches WishGranter behavior closely; cite [EFT wiki Penetration Chance](https://escapefromtarkov.fandom.com/wiki/Ballistics#Penetration_Chance) in code comments):

```
durabilityPercent = currentDurability / maxDurability
effectivePower = penetrationPower
effectiveResistance = armorClass * 10 * (0.5 + 0.5 * durabilityPercent)
delta = effectivePower - effectiveResistance

if delta >= 0:
  chance = 1.0
elif delta <= -15:
  chance = 0.0
else:
  // linear ramp from 0 to 1 across the 15-point window
  chance = 1.0 + delta / 15
```

If `currentDurability <= 0`, return `1.0` regardless (broken armor offers no resistance).

**Files:**
- Create: `packages/ballistics/src/armor/penetrationChance.ts`
- Create: `packages/ballistics/src/armor/penetrationChance.test.ts`

- [ ] **Step 1: Write `packages/ballistics/src/armor/penetrationChance.test.ts`** with EXACTLY:

```ts
import { describe, expect, it } from "vitest";
import { penetrationChance } from "./penetrationChance.js";

describe("penetrationChance", () => {
  it("returns 1.0 when armor durability is zero (broken armor)", () => {
    // Broken armor offers no resistance, so even a peashooter penetrates.
    expect(penetrationChance(1, 6, 0, 80)).toBe(1.0);
  });

  it("returns 1.0 when penetration overwhelms effective resistance", () => {
    // M61-class round (penetration ~70) vs Class 4 fresh: 70 >= 4*10*1.0 = 40.
    expect(penetrationChance(70, 4, 80, 80)).toBe(1.0);
  });

  it("returns 0.0 when penetration is far below effective resistance", () => {
    // PS round (penetration ~20) vs Class 6 fresh: 20 - 6*10*1.0 = -40, well below -15.
    expect(penetrationChance(20, 6, 60, 60)).toBe(0.0);
  });

  it("ramps linearly between -15 and 0 delta", () => {
    // Half-durability Class 4: effectiveResistance = 4*10*(0.5 + 0.5*0.5) = 30.
    // Penetration 22.5 → delta = 22.5 - 30 = -7.5 → chance = 1 - 7.5/15 = 0.5.
    expect(penetrationChance(22.5, 4, 40, 80)).toBeCloseTo(0.5, 5);
  });

  it("clamps non-negative inputs sensibly (durabilityPercent capped at 1)", () => {
    // currentDurability > maxDurability shouldn't break the math.
    expect(penetrationChance(40, 4, 100, 80)).toBe(1.0);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails for "module not found"**

```bash
pnpm --filter @tarkov/ballistics test src/armor/penetrationChance.test.ts
```

Expected: FAIL with an error about missing `./penetrationChance.js`.

- [ ] **Step 3: Write `packages/ballistics/src/armor/penetrationChance.ts`** with EXACTLY:

```ts
/**
 * Probability that a single shot penetrates the armor, in the range [0, 1].
 *
 * Formula derived from the EFT community wiki + WishGranter behavior. Effective
 * resistance scales linearly from 50% at 0 durability to 100% at full durability;
 * penetration probability ramps from 0 to 1 across a 15-point delta window.
 *
 * @example
 *   penetrationChance(40, 4, 80, 80); // 1.0 — overwhelms class 4 fresh
 *   penetrationChance(22.5, 4, 40, 80); // 0.5 — middle of the ramp
 *
 * @see https://escapefromtarkov.fandom.com/wiki/Ballistics
 */
export function penetrationChance(
  penetrationPower: number,
  armorClass: number,
  currentDurability: number,
  maxDurability: number,
): number {
  if (currentDurability <= 0) return 1.0;
  const durabilityPercent = Math.min(1, currentDurability / maxDurability);
  const effectiveResistance = armorClass * 10 * (0.5 + 0.5 * durabilityPercent);
  const delta = penetrationPower - effectiveResistance;
  if (delta >= 0) return 1.0;
  if (delta <= -15) return 0.0;
  return 1.0 + delta / 15;
}
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
pnpm --filter @tarkov/ballistics test src/armor/penetrationChance.test.ts
```

Expected: 5 passing tests.

- [ ] **Step 5: Add export to barrel**

Edit `packages/ballistics/src/index.ts` — add `export { penetrationChance } from "./armor/penetrationChance.js";` at the bottom.

- [ ] **Step 6: Commit**

```bash
git add packages/ballistics/src/armor/penetrationChance.ts packages/ballistics/src/armor/penetrationChance.test.ts packages/ballistics/src/index.ts
git commit -m "feat(ballistics): add penetrationChance"
```

---

### Task 6: `armorDamage` — durability degradation per shot

Computes how many durability points an armor loses from a single hit. Formula from wiki + Ratstash:

```
armorDamage = ammo.armorDamagePercent * armor.materialDestructibility / 100
```

Multiplied by `0.5` if the round did NOT penetrate (deflected hits damage less). Result is rounded to 2 decimal places.

**Files:**
- Create: `packages/ballistics/src/armor/armorDamage.ts`
- Create: `packages/ballistics/src/armor/armorDamage.test.ts`

- [ ] **Step 1: Write `packages/ballistics/src/armor/armorDamage.test.ts`** with EXACTLY:

```ts
import { describe, expect, it } from "vitest";
import { armorDamage } from "./armorDamage.js";

describe("armorDamage", () => {
  it("computes damage on penetration as armorDamagePercent * destructibility / 100", () => {
    // armorDamagePercent=40, destructibility=0.5 → 40 * 0.5 / 100 = 0.20
    expect(armorDamage(40, 0.5, true)).toBeCloseTo(0.2, 5);
  });

  it("halves damage when the round did not penetrate", () => {
    // 40 * 0.5 / 100 = 0.20, halved on deflection → 0.10
    expect(armorDamage(40, 0.5, false)).toBeCloseTo(0.1, 5);
  });

  it("returns 0 for zero armorDamagePercent", () => {
    expect(armorDamage(0, 1.0, true)).toBe(0);
  });

  it("returns 0 for zero destructibility (indestructible material)", () => {
    expect(armorDamage(80, 0, true)).toBe(0);
  });

  it("scales with high-armorDamage ammunition", () => {
    // 80 * 0.85 / 100 = 0.68
    expect(armorDamage(80, 0.85, true)).toBeCloseTo(0.68, 5);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
pnpm --filter @tarkov/ballistics test src/armor/armorDamage.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `packages/ballistics/src/armor/armorDamage.ts`** with EXACTLY:

```ts
/**
 * Durability points removed from the armor by a single hit.
 *
 * If the round penetrated, full damage is dealt. If it deflected, half damage.
 *
 * @example
 *   armorDamage(40, 0.5, true);  // 0.20
 *   armorDamage(40, 0.5, false); // 0.10
 *
 * @see https://escapefromtarkov.fandom.com/wiki/Ballistics
 */
export function armorDamage(
  armorDamagePercent: number,
  materialDestructibility: number,
  didPenetrate: boolean,
): number {
  const baseDamage = (armorDamagePercent * materialDestructibility) / 100;
  return didPenetrate ? baseDamage : baseDamage * 0.5;
}
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
pnpm --filter @tarkov/ballistics test src/armor/armorDamage.test.ts
```

Expected: 5 passing tests.

- [ ] **Step 5: Add export to barrel**

Edit `packages/ballistics/src/index.ts` — append `export { armorDamage } from "./armor/armorDamage.js";`.

- [ ] **Step 6: Commit**

```bash
git add packages/ballistics/src/armor/armorDamage.ts packages/ballistics/src/armor/armorDamage.test.ts packages/ballistics/src/index.ts
git commit -m "feat(ballistics): add armorDamage"
```

---

### Task 7: `effectiveDamage` — damage after armor mitigation

When a round does NOT penetrate, body damage is reduced. Formula:

```
if penetrated: damage = ammo.damage
else: damage = ammo.damage * (1 - armorClass * 0.1 * durabilityPercent)
       (clamped to 0)
```

This is a simplified mitigation curve (real EFT uses a more elaborate "blunt damage" formula; we capture the essential behavior and can refine later).

**Files:**
- Create: `packages/ballistics/src/armor/effectiveDamage.ts`
- Create: `packages/ballistics/src/armor/effectiveDamage.test.ts`

- [ ] **Step 1: Write the test** in `packages/ballistics/src/armor/effectiveDamage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { effectiveDamage } from "./effectiveDamage.js";

describe("effectiveDamage", () => {
  it("returns full ammo damage on penetration", () => {
    expect(effectiveDamage(60, 4, 80, 80, true)).toBe(60);
  });

  it("mitigates damage on deflection by class * 0.1 at full durability", () => {
    // 60 * (1 - 4 * 0.1 * 1.0) = 60 * 0.6 = 36
    expect(effectiveDamage(60, 4, 80, 80, false)).toBeCloseTo(36, 5);
  });

  it("mitigates less when armor is half-durability", () => {
    // 60 * (1 - 4 * 0.1 * 0.5) = 60 * 0.8 = 48
    expect(effectiveDamage(60, 4, 40, 80, false)).toBeCloseTo(48, 5);
  });

  it("does not negate damage even against class 6 fresh (clamped to 0 minimum)", () => {
    // 60 * (1 - 6 * 0.1 * 1.0) = 60 * 0.4 = 24 — still positive
    expect(effectiveDamage(60, 6, 80, 80, false)).toBeCloseTo(24, 5);
  });

  it("clamps to 0 if mitigation would go negative (hypothetical class 11 case)", () => {
    // Class 11 doesn't exist in EFT but the math must remain non-negative.
    expect(effectiveDamage(50, 11, 80, 80, false)).toBe(0);
  });

  it("ignores armor entirely on penetration even against high class", () => {
    expect(effectiveDamage(60, 6, 80, 80, true)).toBe(60);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
pnpm --filter @tarkov/ballistics test src/armor/effectiveDamage.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `packages/ballistics/src/armor/effectiveDamage.ts`**:

```ts
/**
 * Body damage actually dealt after armor mitigation.
 *
 * On penetration, full damage. On deflection, damage is reduced by armor class
 * scaled by current durability percent. Clamped to 0 minimum.
 *
 * @example
 *   effectiveDamage(60, 4, 80, 80, true);  // 60 (penetrated)
 *   effectiveDamage(60, 4, 80, 80, false); // 36 (deflected, full durability)
 */
export function effectiveDamage(
  ammoDamage: number,
  armorClass: number,
  currentDurability: number,
  maxDurability: number,
  didPenetrate: boolean,
): number {
  if (didPenetrate) return ammoDamage;
  const durabilityPercent = Math.min(1, Math.max(0, currentDurability / maxDurability));
  const mitigation = 1 - armorClass * 0.1 * durabilityPercent;
  return Math.max(0, ammoDamage * mitigation);
}
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
pnpm --filter @tarkov/ballistics test src/armor/effectiveDamage.test.ts
```

Expected: 6 passing tests.

- [ ] **Step 5: Add export to barrel**

Append to `packages/ballistics/src/index.ts`: `export { effectiveDamage } from "./armor/effectiveDamage.js";`

- [ ] **Step 6: Commit**

```bash
git add packages/ballistics/src/armor/effectiveDamage.ts packages/ballistics/src/armor/effectiveDamage.test.ts packages/ballistics/src/index.ts
git commit -m "feat(ballistics): add effectiveDamage"
```

---

### Task 8: `simulateShot` — single-shot composition

Composes `penetrationChance`, `armorDamage`, and `effectiveDamage` into a single deterministic shot result. Penetration is decided by comparing `chance` against a default threshold of 0.5 (caller can adapt for probabilistic Monte Carlo by calling the helpers directly).

Distance is accepted as a parameter but does NOT affect the math at MVP (penetration falloff over distance is a real EFT mechanic but the formula is contested; we'll add it in a later iteration). Distance is recorded for return-shape consistency only — it's used by `simulateBurst` for grouping.

**Files:**
- Create: `packages/ballistics/src/shot/simulateShot.ts`
- Create: `packages/ballistics/src/shot/simulateShot.test.ts`

- [ ] **Step 1: Write `packages/ballistics/src/shot/simulateShot.test.ts`**:

```ts
import { describe, expect, it } from "vitest";
import { simulateShot } from "./simulateShot.js";
import type { BallisticAmmo, BallisticArmor } from "../types.js";

const m855: BallisticAmmo = {
  id: "m855",
  name: "M855",
  penetrationPower: 31,
  damage: 49,
  armorDamagePercent: 49,
  projectileCount: 1,
};

const class4Fresh: BallisticArmor = {
  id: "class4-fresh",
  name: "Class 4 (fresh)",
  armorClass: 4,
  maxDurability: 80,
  currentDurability: 80,
  materialDestructibility: 0.5,
  zones: ["chest"],
};

const class3Fresh: BallisticArmor = {
  ...class4Fresh,
  id: "class3-fresh",
  name: "Class 3 (fresh)",
  armorClass: 3,
};

describe("simulateShot", () => {
  it("penetrates when penetration power overwhelms armor", () => {
    // M855 (pen 31) vs Class 3 fresh (effective 30). delta=1 → chance=1.
    const result = simulateShot(m855, class3Fresh, 15);
    expect(result.didPenetrate).toBe(true);
    expect(result.damage).toBe(49);
    expect(result.armorDamage).toBeCloseTo(0.245, 3); // 49 * 0.5 / 100 = 0.245
    expect(result.remainingDurability).toBeCloseTo(80 - 0.245, 3);
    expect(result.residualPenetration).toBe(31);
  });

  it("does not penetrate when chance < 0.5", () => {
    // M855 (pen 31) vs Class 4 fresh (effective 40). delta=-9 → chance=1 - 9/15 ≈ 0.4
    const result = simulateShot(m855, class4Fresh, 15);
    expect(result.didPenetrate).toBe(false);
    expect(result.damage).toBeLessThan(49);
    expect(result.damage).toBeGreaterThan(0);
    expect(result.armorDamage).toBeCloseTo(0.1225, 4); // half on deflection: 0.245/2
  });

  it("returns updated remainingDurability", () => {
    const result = simulateShot(m855, class4Fresh, 15);
    expect(result.remainingDurability).toBeCloseTo(class4Fresh.currentDurability - result.armorDamage, 4);
  });

  it("clamps remainingDurability to 0", () => {
    const almostBroken: BallisticArmor = { ...class4Fresh, currentDurability: 0.05 };
    const result = simulateShot(m855, almostBroken, 15);
    expect(result.remainingDurability).toBeGreaterThanOrEqual(0);
  });

  it("treats broken armor (durability 0) as no resistance", () => {
    const broken: BallisticArmor = { ...class4Fresh, currentDurability: 0 };
    const result = simulateShot(m855, broken, 15);
    expect(result.didPenetrate).toBe(true);
    expect(result.damage).toBe(49);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails (module not found)**

```bash
pnpm --filter @tarkov/ballistics test src/shot/simulateShot.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write `packages/ballistics/src/shot/simulateShot.ts`**:

```ts
import { armorDamage } from "../armor/armorDamage.js";
import { effectiveDamage } from "../armor/effectiveDamage.js";
import { penetrationChance } from "../armor/penetrationChance.js";
import type { BallisticAmmo, BallisticArmor, ShotResult } from "../types.js";

const PENETRATION_THRESHOLD = 0.5;

/**
 * Simulate a single shot deterministically. Penetration is decided by the
 * threshold rule: penetrationChance >= 0.5 → penetrate. For probabilistic
 * (Monte Carlo) callers, use `penetrationChance` directly with an external RNG.
 *
 * `distance` is currently unused in the math (penetration falloff is not yet
 * modeled); it is part of the signature so callers can record it and so
 * `simulateBurst` can present consistent results.
 *
 * @example
 *   simulateShot(m855, class4Fresh, 15);
 */
export function simulateShot(
  ammo: BallisticAmmo,
  armor: BallisticArmor,
  _distance: number,
): ShotResult {
  const chance = penetrationChance(
    ammo.penetrationPower,
    armor.armorClass,
    armor.currentDurability,
    armor.maxDurability,
  );
  const didPenetrate = chance >= PENETRATION_THRESHOLD;
  const dmg = effectiveDamage(
    ammo.damage,
    armor.armorClass,
    armor.currentDurability,
    armor.maxDurability,
    didPenetrate,
  );
  const armorDmg = armorDamage(ammo.armorDamagePercent, armor.materialDestructibility, didPenetrate);
  const remainingDurability = Math.max(0, armor.currentDurability - armorDmg);
  return {
    didPenetrate,
    damage: dmg,
    armorDamage: armorDmg,
    remainingDurability,
    residualPenetration: ammo.penetrationPower,
  };
}
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
pnpm --filter @tarkov/ballistics test src/shot/simulateShot.test.ts
```

Expected: 5 passing tests.

- [ ] **Step 5: Add export to barrel**

Append: `export { simulateShot } from "./shot/simulateShot.js";`

- [ ] **Step 6: Commit**

```bash
git add packages/ballistics/src/shot/simulateShot.ts packages/ballistics/src/shot/simulateShot.test.ts packages/ballistics/src/index.ts
git commit -m "feat(ballistics): add simulateShot"
```

---

### Task 9: `simulateBurst` — multi-shot scenario

Loops `simulateShot`, mutating armor durability between shots. Returns the result array. Stops early if armor breaks AND a parameter `stopOnBreak` is true (default false — caller usually wants the full sequence).

**Files:**
- Create: `packages/ballistics/src/shot/simulateBurst.ts`
- Create: `packages/ballistics/src/shot/simulateBurst.test.ts`

- [ ] **Step 1: Write `packages/ballistics/src/shot/simulateBurst.test.ts`**:

```ts
import { describe, expect, it } from "vitest";
import { simulateBurst } from "./simulateBurst.js";
import type { BallisticAmmo, BallisticArmor } from "../types.js";

const m995: BallisticAmmo = {
  id: "m995",
  name: "M995",
  penetrationPower: 53,
  damage: 49,
  armorDamagePercent: 64,
  projectileCount: 1,
};

const class4Fresh: BallisticArmor = {
  id: "class4",
  name: "Class 4",
  armorClass: 4,
  maxDurability: 80,
  currentDurability: 80,
  materialDestructibility: 0.5,
  zones: ["chest"],
};

describe("simulateBurst", () => {
  it("returns one result per shot", () => {
    const results = simulateBurst(m995, class4Fresh, 5, 15);
    expect(results).toHaveLength(5);
  });

  it("decreases remainingDurability monotonically across the burst", () => {
    const results = simulateBurst(m995, class4Fresh, 5, 15);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].remainingDurability).toBeLessThanOrEqual(results[i - 1].remainingDurability);
    }
  });

  it("each shot's input armor reflects the previous shot's remainingDurability", () => {
    const results = simulateBurst(m995, class4Fresh, 3, 15);
    // M995 reliably penetrates Class 4 fresh, so subsequent shots see degraded armor.
    expect(results[0].didPenetrate).toBe(true);
    expect(results[1].remainingDurability).toBeLessThan(results[0].remainingDurability);
    expect(results[2].remainingDurability).toBeLessThan(results[1].remainingDurability);
  });

  it("returns empty array for zero shots", () => {
    expect(simulateBurst(m995, class4Fresh, 0, 15)).toEqual([]);
  });

  it("rejects negative shot counts (returns empty array)", () => {
    expect(simulateBurst(m995, class4Fresh, -3, 15)).toEqual([]);
  });

  it("does not mutate the caller's armor object", () => {
    const armor = { ...class4Fresh };
    const before = armor.currentDurability;
    simulateBurst(m995, armor, 5, 15);
    expect(armor.currentDurability).toBe(before);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
pnpm --filter @tarkov/ballistics test src/shot/simulateBurst.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `packages/ballistics/src/shot/simulateBurst.ts`**:

```ts
import { simulateShot } from "./simulateShot.js";
import type { BallisticAmmo, BallisticArmor, ShotResult } from "../types.js";

/**
 * Simulate `shots` rounds against the armor in sequence. Each shot sees the
 * armor's remaining durability from the previous shot. The caller's armor
 * object is never mutated.
 *
 * Returns an empty array for non-positive `shots`.
 *
 * @example
 *   simulateBurst(m995, class4Fresh, 5, 15);
 */
export function simulateBurst(
  ammo: BallisticAmmo,
  armor: BallisticArmor,
  shots: number,
  distance: number,
): ShotResult[] {
  if (shots <= 0) return [];
  const results: ShotResult[] = [];
  let currentDurability = armor.currentDurability;
  for (let i = 0; i < shots; i++) {
    const shot = simulateShot(
      ammo,
      { ...armor, currentDurability },
      distance,
    );
    results.push(shot);
    currentDurability = shot.remainingDurability;
  }
  return results;
}
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
pnpm --filter @tarkov/ballistics test src/shot/simulateBurst.test.ts
```

Expected: 6 passing tests.

- [ ] **Step 5: Add export to barrel**

Append: `export { simulateBurst } from "./shot/simulateBurst.js";`

- [ ] **Step 6: Commit**

```bash
git add packages/ballistics/src/shot/simulateBurst.ts packages/ballistics/src/shot/simulateBurst.test.ts packages/ballistics/src/index.ts
git commit -m "feat(ballistics): add simulateBurst"
```

---

## Phase 3: Higher-level functions

### Task 10: `armorEffectiveness` — ammo×armor matrix

Returns a 2D matrix of "shots-to-kill-the-armor" — i.e., how many shots of each ammo it takes to break each armor (durability ≤ 0). Used to power the `/matrix` UI.

If an ammo cannot kill an armor in a reasonable bound (default 500 shots — matches realistic worst-case deflection-only rates), return `Infinity` for that cell.

**Files:**
- Create: `packages/ballistics/src/armor/armorEffectiveness.ts`
- Create: `packages/ballistics/src/armor/armorEffectiveness.test.ts`

- [ ] **Step 1: Write `packages/ballistics/src/armor/armorEffectiveness.test.ts`**:

```ts
import { describe, expect, it } from "vitest";
import { armorEffectiveness } from "./armorEffectiveness.js";
import type { BallisticAmmo, BallisticArmor } from "../types.js";

const ammos: BallisticAmmo[] = [
  { id: "ps", name: "5.45 PS", penetrationPower: 21, damage: 50, armorDamagePercent: 38, projectileCount: 1 },
  { id: "bp", name: "5.45 BP", penetrationPower: 40, damage: 50, armorDamagePercent: 50, projectileCount: 1 },
];

const armors: BallisticArmor[] = [
  { id: "class3", name: "C3", armorClass: 3, maxDurability: 50, currentDurability: 50, materialDestructibility: 0.5, zones: ["chest"] },
  { id: "class5", name: "C5", armorClass: 5, maxDurability: 80, currentDurability: 80, materialDestructibility: 0.45, zones: ["chest"] },
];

describe("armorEffectiveness", () => {
  it("returns a matrix of dimensions [ammos.length][armors.length]", () => {
    const matrix = armorEffectiveness(ammos, armors);
    expect(matrix).toHaveLength(2);
    expect(matrix[0]).toHaveLength(2);
    expect(matrix[1]).toHaveLength(2);
  });

  it("returns finite shots-to-kill for ammo that can defeat the armor", () => {
    const matrix = armorEffectiveness(ammos, armors);
    // BP penetrates Class 3 fresh trivially, so should be a small finite count.
    expect(Number.isFinite(matrix[1][0])).toBe(true);
    expect(matrix[1][0]).toBeGreaterThan(0);
  });

  it("returns Infinity when ammo can't kill armor within the cap", () => {
    // PS (pen 21) vs Class 5 (effective 50 fresh) — chance ≈ 0; armor takes
    // only deflection-half damage. PS armorDmg = 38*0.45/100/2 = 0.0855 per
    // deflected shot. 80/0.0855 ≈ 936 — well above the 500-shot default cap.
    const matrix = armorEffectiveness(ammos, armors);
    expect(matrix[0][1]).toBe(Number.POSITIVE_INFINITY);
  });

  it("higher-pen ammo kills armor in fewer shots than lower-pen ammo (when both can)", () => {
    const matrix = armorEffectiveness(ammos, armors);
    expect(matrix[1][0]).toBeLessThanOrEqual(matrix[0][0]);
  });

  it("does not mutate caller's input arrays or objects", () => {
    const ammosBefore = JSON.parse(JSON.stringify(ammos));
    const armorsBefore = JSON.parse(JSON.stringify(armors));
    armorEffectiveness(ammos, armors);
    expect(ammos).toEqual(ammosBefore);
    expect(armors).toEqual(armorsBefore);
  });

  it("returns empty matrix for empty inputs", () => {
    expect(armorEffectiveness([], armors)).toEqual([]);
    expect(armorEffectiveness(ammos, [])).toEqual([[], []]);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
pnpm --filter @tarkov/ballistics test src/armor/armorEffectiveness.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `packages/ballistics/src/armor/armorEffectiveness.ts`**:

```ts
import { simulateBurst } from "../shot/simulateBurst.js";
import type { BallisticAmmo, BallisticArmor } from "../types.js";

const DEFAULT_SHOT_CAP = 500;

/**
 * Compute a 2D matrix where `matrix[i][j]` is the number of shots of `ammos[i]`
 * needed to break (durability ≤ 0) `armors[j]`. Returns `Infinity` for cells
 * where the ammo cannot defeat the armor within `shotCap` shots.
 *
 * Used to power the AmmoVsArmor matrix UI. Default cap of 500 covers realistic
 * worst-case deflection-only rates without being unbounded.
 *
 * @example
 *   armorEffectiveness([m855, m995], [class4, class6]);
 */
export function armorEffectiveness(
  ammos: readonly BallisticAmmo[],
  armors: readonly BallisticArmor[],
  shotCap: number = DEFAULT_SHOT_CAP,
): number[][] {
  return ammos.map((ammo) =>
    armors.map((armor) => {
      const sequence = simulateBurst(ammo, armor, shotCap, 15);
      const breakIndex = sequence.findIndex((s) => s.remainingDurability <= 0);
      return breakIndex === -1 ? Number.POSITIVE_INFINITY : breakIndex + 1;
    }),
  );
}
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
pnpm --filter @tarkov/ballistics test src/armor/armorEffectiveness.test.ts
```

Expected: 6 passing tests.

- [ ] **Step 5: Add export to barrel**

Append: `export { armorEffectiveness } from "./armor/armorEffectiveness.js";`

- [ ] **Step 6: Commit**

```bash
git add packages/ballistics/src/armor/armorEffectiveness.ts packages/ballistics/src/armor/armorEffectiveness.test.ts packages/ballistics/src/index.ts
git commit -m "feat(ballistics): add armorEffectiveness"
```

---

### Task 11: `weaponSpec` — weapon + mods aggregation

Sums ergonomics, weight, and accuracy deltas from mods onto the weapon's base. Recoil uses multiplicative percent: each mod's `recoilModifierPercent` reduces (or increases) recoil; multipliers are summed first, then applied as `base * (1 + sum/100)`.

**Files:**
- Create: `packages/ballistics/src/weapon/weaponSpec.ts`
- Create: `packages/ballistics/src/weapon/weaponSpec.test.ts`

- [ ] **Step 1: Write `packages/ballistics/src/weapon/weaponSpec.test.ts`**:

```ts
import { describe, expect, it } from "vitest";
import { weaponSpec } from "./weaponSpec.js";
import type { BallisticWeapon, BallisticMod } from "../types.js";

const m4: BallisticWeapon = {
  id: "m4",
  name: "M4A1",
  baseErgonomics: 50,
  baseVerticalRecoil: 56,
  baseHorizontalRecoil: 220,
  baseWeight: 2.7,
  baseAccuracy: 3.5,
};

const grip: BallisticMod = {
  id: "grip-mk16",
  name: "MK16 Grip",
  ergonomicsDelta: 8,
  recoilModifierPercent: -3,
  weight: 0.05,
  accuracyDelta: 0,
};

const stock: BallisticMod = {
  id: "stock-buffertube",
  name: "Buffer Tube Stock",
  ergonomicsDelta: -2,
  recoilModifierPercent: -8,
  weight: 0.3,
  accuracyDelta: 0,
};

const muzzle: BallisticMod = {
  id: "muzzle-comp",
  name: "Compensator",
  ergonomicsDelta: -3,
  recoilModifierPercent: -15,
  weight: 0.1,
  accuracyDelta: -0.5,
};

describe("weaponSpec", () => {
  it("returns base stats when no mods are attached", () => {
    const spec = weaponSpec(m4, []);
    expect(spec.weaponId).toBe("m4");
    expect(spec.modCount).toBe(0);
    expect(spec.ergonomics).toBe(50);
    expect(spec.verticalRecoil).toBe(56);
    expect(spec.horizontalRecoil).toBe(220);
    expect(spec.weight).toBeCloseTo(2.7, 5);
    expect(spec.accuracy).toBe(3.5);
  });

  it("sums ergonomics deltas additively", () => {
    const spec = weaponSpec(m4, [grip, stock, muzzle]);
    // 50 + 8 + (-2) + (-3) = 53
    expect(spec.ergonomics).toBe(53);
  });

  it("applies recoil multipliers as (1 + sum/100) of base", () => {
    const spec = weaponSpec(m4, [grip, stock, muzzle]);
    // sum = -3 + -8 + -15 = -26 → 56 * (1 - 0.26) = 41.44
    expect(spec.verticalRecoil).toBeCloseTo(41.44, 4);
    expect(spec.horizontalRecoil).toBeCloseTo(220 * 0.74, 4);
  });

  it("sums mod weights onto base weight", () => {
    const spec = weaponSpec(m4, [grip, stock, muzzle]);
    // 2.7 + 0.05 + 0.3 + 0.1 = 3.15
    expect(spec.weight).toBeCloseTo(3.15, 5);
  });

  it("sums accuracy deltas (lower is better)", () => {
    const spec = weaponSpec(m4, [grip, stock, muzzle]);
    // 3.5 + 0 + 0 + (-0.5) = 3.0
    expect(spec.accuracy).toBeCloseTo(3.0, 5);
  });

  it("reports modCount accurately", () => {
    expect(weaponSpec(m4, []).modCount).toBe(0);
    expect(weaponSpec(m4, [grip]).modCount).toBe(1);
    expect(weaponSpec(m4, [grip, stock, muzzle]).modCount).toBe(3);
  });

  it("does not mutate the caller's mods array", () => {
    const mods = [grip, stock, muzzle];
    const before = [...mods];
    weaponSpec(m4, mods);
    expect(mods).toEqual(before);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
pnpm --filter @tarkov/ballistics test src/weapon/weaponSpec.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `packages/ballistics/src/weapon/weaponSpec.ts`**:

```ts
import type { BallisticWeapon, BallisticMod, WeaponSpec } from "../types.js";

/**
 * Aggregate weapon base stats with attached mods.
 *
 * Ergonomics, weight, and accuracy are additive. Recoil uses multiplicative
 * percent: sum of `recoilModifierPercent` from all mods, applied as
 * `base * (1 + sum/100)`.
 *
 * @example
 *   const spec = weaponSpec(m4, [grip, stock, muzzle]);
 *   spec.ergonomics; // 53
 *   spec.verticalRecoil; // 41.44
 */
export function weaponSpec(weapon: BallisticWeapon, mods: readonly BallisticMod[]): WeaponSpec {
  const ergonomicsDelta = mods.reduce((sum, m) => sum + m.ergonomicsDelta, 0);
  const recoilSumPercent = mods.reduce((sum, m) => sum + m.recoilModifierPercent, 0);
  const weightDelta = mods.reduce((sum, m) => sum + m.weight, 0);
  const accuracyDelta = mods.reduce((sum, m) => sum + m.accuracyDelta, 0);
  const recoilMultiplier = 1 + recoilSumPercent / 100;
  return {
    weaponId: weapon.id,
    modCount: mods.length,
    ergonomics: weapon.baseErgonomics + ergonomicsDelta,
    verticalRecoil: weapon.baseVerticalRecoil * recoilMultiplier,
    horizontalRecoil: weapon.baseHorizontalRecoil * recoilMultiplier,
    weight: weapon.baseWeight + weightDelta,
    accuracy: weapon.baseAccuracy + accuracyDelta,
  };
}
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
pnpm --filter @tarkov/ballistics test src/weapon/weaponSpec.test.ts
```

Expected: 7 passing tests.

- [ ] **Step 5: Add export to barrel**

Append: `export { weaponSpec } from "./weapon/weaponSpec.js";`

- [ ] **Step 6: Commit**

```bash
git add packages/ballistics/src/weapon/weaponSpec.ts packages/ballistics/src/weapon/weaponSpec.test.ts packages/ballistics/src/index.ts
git commit -m "feat(ballistics): add weaponSpec"
```

---

## Phase 4: Polish + integration

### Task 12: Sample fixture data

Provide curated sample ammo, armor, and weapon objects for use in integration tests, the matrix UI, and documentation. Numbers are taken from the EFT wiki where available, marked with comments. These are **not** the source of truth for game data — they exist for tests and demos only.

**Files:**
- Create: `packages/ballistics/src/__fixtures__/ammo.ts`
- Create: `packages/ballistics/src/__fixtures__/armor.ts`
- Create: `packages/ballistics/src/__fixtures__/weapons.ts`

- [ ] **Step 1: Create `packages/ballistics/src/__fixtures__/ammo.ts`**:

```ts
import type { BallisticAmmo } from "../types.js";

// SOURCE: https://escapefromtarkov.fandom.com/wiki/5.45x39mm
export const PS_545: BallisticAmmo = {
  id: "fixture-545-ps",
  name: "5.45x39mm PS gs",
  penetrationPower: 21,
  damage: 50,
  armorDamagePercent: 38,
  projectileCount: 1,
};

// SOURCE: https://escapefromtarkov.fandom.com/wiki/5.45x39mm
export const BP_545: BallisticAmmo = {
  id: "fixture-545-bp",
  name: "5.45x39mm BP gs",
  penetrationPower: 40,
  damage: 50,
  armorDamagePercent: 50,
  projectileCount: 1,
};

// SOURCE: https://escapefromtarkov.fandom.com/wiki/5.56x45mm_NATO
export const M855: BallisticAmmo = {
  id: "fixture-556-m855",
  name: "5.56x45mm M855",
  penetrationPower: 31,
  damage: 49,
  armorDamagePercent: 49,
  projectileCount: 1,
};

// SOURCE: https://escapefromtarkov.fandom.com/wiki/5.56x45mm_NATO
export const M995: BallisticAmmo = {
  id: "fixture-556-m995",
  name: "5.56x45mm M995",
  penetrationPower: 53,
  damage: 49,
  armorDamagePercent: 64,
  projectileCount: 1,
};
```

- [ ] **Step 2: Create `packages/ballistics/src/__fixtures__/armor.ts`**:

```ts
import type { BallisticArmor } from "../types.js";

// SOURCE: https://escapefromtarkov.fandom.com/wiki/Armor_vests
export const PACA_C3: BallisticArmor = {
  id: "fixture-paca",
  name: "PACA Soft Armor (Class 3)",
  armorClass: 3,
  maxDurability: 40,
  currentDurability: 40,
  materialDestructibility: 0.55,
  zones: ["chest", "stomach"],
};

export const KORD_C4: BallisticArmor = {
  id: "fixture-kord",
  name: "Kord Defender-2 (Class 4)",
  armorClass: 4,
  maxDurability: 60,
  currentDurability: 60,
  materialDestructibility: 0.5,
  zones: ["chest", "stomach"],
};

export const HEXGRID_C5: BallisticArmor = {
  id: "fixture-hexgrid",
  name: "5.11 Hexgrid (Class 5)",
  armorClass: 5,
  maxDurability: 80,
  currentDurability: 80,
  materialDestructibility: 0.45,
  zones: ["chest", "stomach"],
};

export const SLICK_C6: BallisticArmor = {
  id: "fixture-slick",
  name: "Slick (Class 6)",
  armorClass: 6,
  maxDurability: 80,
  currentDurability: 80,
  materialDestructibility: 0.5,
  zones: ["chest", "stomach"],
};
```

- [ ] **Step 3: Create `packages/ballistics/src/__fixtures__/weapons.ts`**:

```ts
import type { BallisticWeapon, BallisticMod } from "../types.js";

// SOURCE: https://escapefromtarkov.fandom.com/wiki/M4A1
export const M4A1: BallisticWeapon = {
  id: "fixture-m4a1",
  name: "Colt M4A1 5.56x45mm",
  baseErgonomics: 50,
  baseVerticalRecoil: 56,
  baseHorizontalRecoil: 220,
  baseWeight: 2.7,
  baseAccuracy: 3.5,
};

export const MK16_GRIP: BallisticMod = {
  id: "fixture-grip-mk16",
  name: "FN MK16 Pistol Grip",
  ergonomicsDelta: 8,
  recoilModifierPercent: -3,
  weight: 0.05,
  accuracyDelta: 0,
};

export const BUFFER_STOCK: BallisticMod = {
  id: "fixture-stock-buffer",
  name: "Mil-Spec Buffer Tube Stock",
  ergonomicsDelta: -2,
  recoilModifierPercent: -8,
  weight: 0.3,
  accuracyDelta: 0,
};

export const COMPENSATOR: BallisticMod = {
  id: "fixture-muzzle-comp",
  name: "AR-15 Compensator",
  ergonomicsDelta: -3,
  recoilModifierPercent: -15,
  weight: 0.1,
  accuracyDelta: -0.5,
};
```

- [ ] **Step 4: Verify lint + typecheck pass**

```bash
pnpm --filter @tarkov/ballistics typecheck && pnpm exec eslint packages/ballistics --max-warnings 0
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/ballistics/src/__fixtures__/
git commit -m "test(ballistics): add wiki-sourced sample fixtures"
```

---

### Task 13: Integration test using fixtures

A smoke test that exercises all four public functions together with the curated fixtures, ensuring the public API is coherent end-to-end.

**Files:**
- Create: `packages/ballistics/src/index.test.ts`

- [ ] **Step 1: Write `packages/ballistics/src/index.test.ts`**:

```ts
import { describe, expect, it } from "vitest";
import {
  simulateShot,
  simulateBurst,
  armorEffectiveness,
  weaponSpec,
} from "./index.js";
import { M855, M995, PS_545, BP_545 } from "./__fixtures__/ammo.js";
import { PACA_C3, KORD_C4, HEXGRID_C5, SLICK_C6 } from "./__fixtures__/armor.js";
import { M4A1, MK16_GRIP, BUFFER_STOCK, COMPENSATOR } from "./__fixtures__/weapons.js";

describe("public API integration", () => {
  it("simulateShot produces a deterministic result for a known matchup", () => {
    const result = simulateShot(M995, KORD_C4, 15);
    expect(result.didPenetrate).toBe(true);
    expect(result.damage).toBe(M995.damage);
    expect(result.armorDamage).toBeGreaterThan(0);
  });

  it("simulateBurst breaks Class 3 armor with M995 in a small number of shots", () => {
    const burst = simulateBurst(M995, PACA_C3, 30, 15);
    const breakAt = burst.findIndex((s) => s.remainingDurability <= 0);
    expect(breakAt).toBeGreaterThan(-1);
    expect(breakAt).toBeLessThan(30);
  });

  it("armorEffectiveness orders ammo correctly: M995 outperforms M855 across the board", () => {
    const matrix = armorEffectiveness([M855, M995], [PACA_C3, KORD_C4, HEXGRID_C5, SLICK_C6]);
    for (let armorIndex = 0; armorIndex < 4; armorIndex++) {
      // M995 row [1] should be ≤ M855 row [0] for every armor
      expect(matrix[1][armorIndex]).toBeLessThanOrEqual(matrix[0][armorIndex]);
    }
  });

  it("armorEffectiveness shows PS-545 as effectively useless against Class 6 (Infinity)", () => {
    const matrix = armorEffectiveness([PS_545, BP_545], [SLICK_C6]);
    expect(matrix[0][0]).toBe(Number.POSITIVE_INFINITY);
  });

  it("weaponSpec aggregates the M4A1 with three mods correctly", () => {
    const spec = weaponSpec(M4A1, [MK16_GRIP, BUFFER_STOCK, COMPENSATOR]);
    expect(spec.weaponId).toBe(M4A1.id);
    expect(spec.modCount).toBe(3);
    expect(spec.ergonomics).toBe(50 + 8 - 2 - 3);
    expect(spec.verticalRecoil).toBeCloseTo(56 * (1 - 0.26), 4);
  });
});
```

- [ ] **Step 2: Run the test, verify it passes**

```bash
pnpm --filter @tarkov/ballistics test src/index.test.ts
```

Expected: 5 passing tests.

- [ ] **Step 3: Run the full test suite + coverage**

```bash
pnpm --filter @tarkov/ballistics test:coverage
```

Expected: all tests pass, coverage thresholds met (100% lines/functions/statements, ≥95% branches).

If coverage fails: examine the report (`packages/ballistics/coverage/index.html`), identify uncovered branches, add tests, retry. Do NOT lower the thresholds.

- [ ] **Step 4: Commit**

```bash
git add packages/ballistics/src/index.test.ts
git commit -m "test(ballistics): add public API integration tests"
```

---

### Task 14: Verify Turbo dispatches the new package

Now that `packages/ballistics` has `lint`, `typecheck`, `test`, and `build` scripts, the root `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` should fan out via Turbo.

**Files:** none (verification only)

- [ ] **Step 1: Verify root `pnpm typecheck`**

```bash
pnpm typecheck 2>&1 | tail -10
```

Expected: turbo runs `typecheck` in 1 package (`@tarkov/ballistics`), result: 1 successful.

- [ ] **Step 2: Verify root `pnpm lint`**

```bash
pnpm lint 2>&1 | tail -10
```

Expected: turbo runs `lint` in 1 package, exit 0.

- [ ] **Step 3: Verify root `pnpm test`**

```bash
pnpm test 2>&1 | tail -10
```

Expected: turbo runs `test` in 1 package, exit 0.

- [ ] **Step 4: Verify root `pnpm build` produces `dist/`**

```bash
pnpm build 2>&1 | tail -10
ls packages/ballistics/dist/
```

Expected: `dist/index.js`, `dist/index.d.ts`, and per-domain subfolders. Build exit 0.

- [ ] **Step 5: Verify root `pnpm format:check` still passes**

```bash
pnpm format:check
```

Expected: exit 0.

- [ ] **Step 6: No commit needed for this task** (verification only). If any step fails, fix the offending package config and commit the fix as `fix(ballistics): <what>`.

---

### Task 15: Update root `CLAUDE.md` to mention `packages/ballistics`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Edit `CLAUDE.md` Status callout**

Find:
```markdown
> **Status:** Foundation in place (Milestone 0a complete). Monorepo, CI, and AI workflow Tier B are wired. No `apps/*` or `packages/*` exist yet — those land in Milestones 0b (Workers), 0c (Web app), and 0d (Data & Math packages). See [`docs/superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md`](docs/superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md) for the full design.
```

Replace with:
```markdown
> **Status:** Foundation in place + `packages/ballistics` shipped. Monorepo, CI, AI workflow Tier B, and the pure-TS ballistic math package are live. Still pending: `packages/tarkov-types`, `packages/tarkov-data`, `packages/ui`, `apps/data-proxy`, `apps/builds-api`, `apps/web`. See [`docs/superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md`](docs/superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md) for the full design.
```

- [ ] **Step 2: Edit the "Repo layout (target)" section to mark progress**

Find the `packages/ballistics` line in the layout block and verify it's still listed. (No change needed; the line is already accurate. This step is just to sanity-check that the layout block doesn't go stale.)

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note packages/ballistics shipped in CLAUDE.md status"
```

---

## Phase 5: Ship

### Task 16: Final verification + open PR

**Files:** none

- [ ] **Step 1: Run all gates from a clean install**

```bash
rm -rf node_modules packages/ballistics/node_modules packages/ballistics/dist packages/ballistics/.tsbuildinfo
pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
```

Expected: every step exits 0.

- [ ] **Step 2: Confirm coverage thresholds with the explicit run**

```bash
pnpm --filter @tarkov/ballistics test:coverage 2>&1 | tail -20
```

Expected: coverage summary shows ≥100% lines/functions/statements, ≥95% branches.

- [ ] **Step 3: Push the branch + open PR**

The branch name for this plan is `feat/packages-ballistics`.

```bash
git push -u origin feat/packages-ballistics
gh pr create --base main --head feat/packages-ballistics --title "feat(ballistics): add @tarkov/ballistics package" --body "Implements the four public functions from the design spec (\`simulateShot\`, \`simulateBurst\`, \`armorEffectiveness\`, \`weaponSpec\`) plus the helpers (\`penetrationChance\`, \`armorDamage\`, \`effectiveDamage\`). 100% TDD with wiki-sourced fixtures.

Closes the first item on the dependency-tier path (0d.1)."
```

Capture the returned PR number (e.g., `6`).

- [ ] **Step 4: Verify CI runs and goes green explicitly**

```bash
sleep 8
gh pr checks <pr-number> --repo UnderMyBed/TarkovGunsmith
# Find the CI run id from `gh run list --branch feat/packages-ballistics`, then:
gh run view <run-id> --json conclusion --jq '.conclusion'
```

Expected: `success`. Do not trust `gh run watch --exit-status` exit code in `&&` chains — read `conclusion` explicitly. Branch protection on `main` requires this check to be green before merging.

- [ ] **Step 5: Squash-merge**

```bash
gh pr merge <pr-number> --repo UnderMyBed/TarkovGunsmith --squash --delete-branch
```

- [ ] **Step 6: release-please will auto-open the v0.2.0 release PR**

Verify with:
```bash
gh pr list --repo UnderMyBed/TarkovGunsmith --state open
```

Expected: a `chore(main): release 0.2.0` PR. Wait for its CI to run (now triggered explicitly via `workflow_dispatch` thanks to the prior fix), then merge. v0.2.0 tag and GitHub Release will be created automatically.

---

## Done — what's true after this plan

- `packages/ballistics` exists at `0.0.0` (workspace-internal) and is fully functional.
- 4 public functions + 3 helpers, all 100% TDD-tested with realistic wiki-sourced fixtures.
- Coverage thresholds enforced in `vitest.config.ts`.
- Root `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` all exercise the new package.
- Repo released as `v0.2.0` via release-please.

## What's NOT true yet (intentionally deferred)

- No real game data in the package — fixtures are illustrative only. The data layer (`packages/tarkov-data`, plan 0d.3) brings live numbers from `api.tarkov.dev`.
- No distance falloff for penetration. The `distance` parameter is part of the signature but not used in math; will be added in a follow-up plan once we have a clear formula and cross-check fixtures.
- No probabilistic Monte Carlo simulation. `simulateShot` is deterministic via the 0.5 threshold rule; callers wanting randomized outcomes should call `penetrationChance` directly with their own RNG.
- No "blunt damage" or "head shot" modeling. The current armor mitigation curve is a simplification.
- Cross-check fixtures vs. the original `WishGranter` C# outputs are not yet present (the C# repo is archived as defunct; we'd need to spin it up to compare). Defer until needed.
