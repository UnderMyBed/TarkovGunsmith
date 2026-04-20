# Ballistics Simulator PR 2 — `useScenario` Hook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the client-side state layer for `/sim`: a pure `scenarioReducer` (append / move / remove / clear / run) and a thin `useScenario` React hook that wraps it. No route or UI in this PR — the hook must be callable from both tests and the next PR's components.

**Architecture:** Pure reducer in `apps/web/src/features/sim/scenarioReducer.ts` tested as a vitest unit. Hook in `apps/web/src/features/sim/useScenario.ts` wraps `useReducer`. The `run` action invokes `simulateScenario` from `@tarkov/ballistics` inside the reducer — this is acceptable because `simulateScenario` is a pure synchronous function (no I/O, no time-dependence). Plan length capped at 128 per spec §9 risk mitigation.

**Tech Stack:** React 19, TypeScript strict, Vitest (node env — no DOM / renderHook).

---

## Reference material

- **Spec:** `docs/superpowers/specs/2026-04-19-ballistics-simulator-design.md` §5.2 (state + hooks) and §9 (risks — plan length cap = 128).
- **Shipped in PR 1:** `@tarkov/ballistics` exports `simulateScenario`, `Zone`, `PlannedShot`, `ShotPlan`, `ScenarioTarget`, `ScenarioResult`, `createPmcTarget`, `PMC_BODY_DEFAULTS`.
- **App conventions:** `apps/web/CLAUDE.md`. File-based routes, data via `@tarkov/data` hooks, UI via `@tarkov/ui`. No `@testing-library/react` installed — hook tests must use pure state assertions, not React renders.
- **State pattern:** Existing routes (`builder.tsx`) use plain `useState` because their state is flat. The scenario's 5 actions + invariants warrant a reducer for testability.

## Scope decisions

1. **Plan length cap = 128, enforced in the reducer on `append`.** Further appends silently no-op. Rationale: spec §9 risk mitigation; any realistic scenario finishes in < 50 shots.
2. **`run` is an action, not a hook side-effect.** Action carries `{ ammo, target }`, reducer computes `ScenarioResult` via `simulateScenario`, stores in `lastResult`. Keeps the hook body trivial.
3. **`run` with an empty plan no-ops** (no state change) — spec §4 already defines simulateScenario to return an empty result in that case; storing the empty result is harmless, but skipping the update matches user intuition ("nothing to run"). Implementation: write the empty result anyway; reducer consistency > minor optimisation.
4. **`move` clamps out-of-range indexes.** `from` / `to` < 0 or ≥ plan.length → no-op. Rationale: reducer should be total (no thrown errors) so the UI can't crash on stale indexes after rapid reorder + remove.
5. **`remove` on out-of-range index no-ops.** Same rationale.
6. **`clear` resets `plan` AND `lastResult`.** Both are scenario-scoped; keeping a stale result after clearing the plan is confusing.
7. **No hook tests beyond a smoke-render via `useReducer`'s raw behaviour.** All logic lives in the pure reducer; the hook is a ~15-line pass-through wrapper. Adding `@testing-library/react` just for this feels like scope creep. Revisit in PR 3/4 if needed.

## File map

```
apps/web/src/features/sim/
├── scenarioReducer.ts                NEW — pure reducer + ScenarioState + ScenarioAction types
├── scenarioReducer.test.ts           NEW — reducer unit tests (vitest, no React)
└── useScenario.ts                    NEW — React hook wrapping useReducer
```

No changes outside `apps/web/src/features/sim/`.

---

## Task 0: Worktree + branch setup

**Files:** none modified; repo-level.

- [ ] **Step 1: Create the worktree off `origin/main`.**

```bash
cd /mnt/c/Users/Matt/Source/TarkovGunsmith
git fetch origin
git worktree add .worktrees/sim-pr2-scenario-hook -b feat/sim-pr2-scenario-hook origin/main
cd .worktrees/sim-pr2-scenario-hook
```

Expected: new worktree branched off latest `origin/main` (which already has PR 1's merged code).

- [ ] **Step 2: Install + build workspace deps.**

```bash
pnpm install --frozen-lockfile
pnpm --filter @tarkov/ballistics build
```

The second command rebuilds the ballistics `dist/` output so `apps/web` sees the PR 1 scenario exports.

- [ ] **Step 3: Baseline.**

```bash
pnpm --filter @tarkov/web typecheck
pnpm --filter @tarkov/web lint
pnpm --filter @tarkov/web test
```

Expected: all green.

---

## Task 1: Reducer + `append` action

**Files:**

- Create: `apps/web/src/features/sim/scenarioReducer.ts`
- Create: `apps/web/src/features/sim/scenarioReducer.test.ts`

- [ ] **Step 1: Write the failing test.** Create `scenarioReducer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { PlannedShot } from "@tarkov/ballistics";
import {
  type ScenarioState,
  initialScenarioState,
  scenarioReducer,
  PLAN_LENGTH_CAP,
} from "./scenarioReducer.js";

const shot = (zone: PlannedShot["zone"]): PlannedShot => ({ zone, distance: 15 });

describe("scenarioReducer — append", () => {
  it("appends to an empty plan", () => {
    const next = scenarioReducer(initialScenarioState, {
      type: "append",
      shot: shot("thorax"),
    });
    expect(next.plan).toEqual([shot("thorax")]);
    expect(next.lastResult).toBeNull();
  });

  it("appends preserving existing order", () => {
    const state: ScenarioState = {
      plan: [shot("head"), shot("thorax")],
      lastResult: null,
    };
    const next = scenarioReducer(state, { type: "append", shot: shot("leftLeg") });
    expect(next.plan.map((s) => s.zone)).toEqual(["head", "thorax", "leftLeg"]);
  });

  it("silently no-ops when the plan is at the length cap", () => {
    const full: ScenarioState = {
      plan: Array.from({ length: PLAN_LENGTH_CAP }, () => shot("stomach")),
      lastResult: null,
    };
    const next = scenarioReducer(full, { type: "append", shot: shot("head") });
    expect(next).toBe(full); // identity preserved
    expect(next.plan).toHaveLength(PLAN_LENGTH_CAP);
  });

  it("enforces the cap = 128 explicitly", () => {
    expect(PLAN_LENGTH_CAP).toBe(128);
  });
});
```

- [ ] **Step 2: Run tests — expect failure.**

```bash
pnpm --filter @tarkov/web test -- scenarioReducer
```

Expected: FAIL. "Cannot find module './scenarioReducer.js'".

- [ ] **Step 3: Write minimal `scenarioReducer.ts`.**

```ts
import {
  simulateScenario,
  type BallisticAmmo,
  type PlannedShot,
  type ScenarioResult,
  type ScenarioTarget,
} from "@tarkov/ballistics";

export const PLAN_LENGTH_CAP = 128;

export interface ScenarioState {
  readonly plan: readonly PlannedShot[];
  readonly lastResult: ScenarioResult | null;
}

export const initialScenarioState: ScenarioState = {
  plan: [],
  lastResult: null,
};

export type ScenarioAction =
  | { type: "append"; shot: PlannedShot }
  | { type: "move"; from: number; to: number }
  | { type: "remove"; index: number }
  | { type: "clear" }
  | { type: "run"; ammo: BallisticAmmo; target: ScenarioTarget };

export function scenarioReducer(state: ScenarioState, action: ScenarioAction): ScenarioState {
  switch (action.type) {
    case "append": {
      if (state.plan.length >= PLAN_LENGTH_CAP) return state;
      return { ...state, plan: [...state.plan, action.shot] };
    }
    case "move":
    case "remove":
    case "clear":
    case "run": {
      // Implemented in later tasks.
      return state;
    }
  }
}
```

Note the `BallisticAmmo` import — it isn't exported by name from `@tarkov/ballistics`' current index. Confirm via the shipped surface (PR 1 index.ts re-exports `BallisticAmmo` at the top).

- [ ] **Step 4: Run tests — 4 passing.**

```bash
pnpm --filter @tarkov/web test -- scenarioReducer
```

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/features/sim/scenarioReducer.ts apps/web/src/features/sim/scenarioReducer.test.ts
git commit -m "feat(sim): scenarioReducer skeleton with append + length cap"
```

---

## Task 2: `move` action

**Files:**

- Modify: `apps/web/src/features/sim/scenarioReducer.ts`
- Modify: `apps/web/src/features/sim/scenarioReducer.test.ts`

- [ ] **Step 1: Add failing tests.** Append to the test file:

```ts
describe("scenarioReducer — move", () => {
  const base: ScenarioState = {
    plan: [shot("head"), shot("thorax"), shot("stomach")],
    lastResult: null,
  };

  it("moves an item forward", () => {
    const next = scenarioReducer(base, { type: "move", from: 0, to: 2 });
    expect(next.plan.map((s) => s.zone)).toEqual(["thorax", "stomach", "head"]);
  });

  it("moves an item backward", () => {
    const next = scenarioReducer(base, { type: "move", from: 2, to: 0 });
    expect(next.plan.map((s) => s.zone)).toEqual(["stomach", "head", "thorax"]);
  });

  it("no-ops when from === to", () => {
    const next = scenarioReducer(base, { type: "move", from: 1, to: 1 });
    expect(next).toBe(base);
  });

  it("no-ops when from is out of range", () => {
    expect(scenarioReducer(base, { type: "move", from: -1, to: 0 })).toBe(base);
    expect(scenarioReducer(base, { type: "move", from: 3, to: 0 })).toBe(base);
  });

  it("no-ops when to is out of range", () => {
    expect(scenarioReducer(base, { type: "move", from: 0, to: -1 })).toBe(base);
    expect(scenarioReducer(base, { type: "move", from: 0, to: 3 })).toBe(base);
  });
});
```

- [ ] **Step 2: Run tests — expect 5 new failures.**

```bash
pnpm --filter @tarkov/web test -- scenarioReducer
```

- [ ] **Step 3: Implement the `move` case.** Replace `case "move":` body:

```ts
    case "move": {
      const { from, to } = action;
      const len = state.plan.length;
      if (from === to) return state;
      if (from < 0 || from >= len || to < 0 || to >= len) return state;
      const plan = [...state.plan];
      const [item] = plan.splice(from, 1);
      plan.splice(to, 0, item!);
      return { ...state, plan };
    }
```

- [ ] **Step 4: Run tests — all pass.**

Expected: 9 total passing.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/features/sim/scenarioReducer.ts apps/web/src/features/sim/scenarioReducer.test.ts
git commit -m "feat(sim): scenarioReducer move action"
```

---

## Task 3: `remove` action

**Files:**

- Modify: `apps/web/src/features/sim/scenarioReducer.ts`
- Modify: `apps/web/src/features/sim/scenarioReducer.test.ts`

- [ ] **Step 1: Add failing tests.** Append:

```ts
describe("scenarioReducer — remove", () => {
  const base: ScenarioState = {
    plan: [shot("head"), shot("thorax"), shot("stomach")],
    lastResult: null,
  };

  it("removes an item by index", () => {
    const next = scenarioReducer(base, { type: "remove", index: 1 });
    expect(next.plan.map((s) => s.zone)).toEqual(["head", "stomach"]);
  });

  it("handles removing the first item", () => {
    const next = scenarioReducer(base, { type: "remove", index: 0 });
    expect(next.plan.map((s) => s.zone)).toEqual(["thorax", "stomach"]);
  });

  it("handles removing the last item", () => {
    const next = scenarioReducer(base, { type: "remove", index: 2 });
    expect(next.plan.map((s) => s.zone)).toEqual(["head", "thorax"]);
  });

  it("no-ops on out-of-range index", () => {
    expect(scenarioReducer(base, { type: "remove", index: -1 })).toBe(base);
    expect(scenarioReducer(base, { type: "remove", index: 3 })).toBe(base);
  });
});
```

- [ ] **Step 2: Run — expect 4 new failures.**

- [ ] **Step 3: Implement.** Replace `case "remove":`:

```ts
    case "remove": {
      const { index } = action;
      if (index < 0 || index >= state.plan.length) return state;
      return { ...state, plan: state.plan.filter((_, i) => i !== index) };
    }
```

- [ ] **Step 4: Run — 13 total passing.**

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/features/sim/scenarioReducer.ts apps/web/src/features/sim/scenarioReducer.test.ts
git commit -m "feat(sim): scenarioReducer remove action"
```

---

## Task 4: `clear` action

**Files:**

- Modify: `apps/web/src/features/sim/scenarioReducer.ts`
- Modify: `apps/web/src/features/sim/scenarioReducer.test.ts`

- [ ] **Step 1: Add failing tests.** Append:

```ts
describe("scenarioReducer — clear", () => {
  it("resets plan and lastResult", () => {
    const state: ScenarioState = {
      plan: [shot("head"), shot("thorax")],
      lastResult: {
        shots: [],
        killed: false,
        killedAt: null,
      },
    };
    const next = scenarioReducer(state, { type: "clear" });
    expect(next.plan).toEqual([]);
    expect(next.lastResult).toBeNull();
  });

  it("returns the initial state sentinel equivalent", () => {
    const next = scenarioReducer(initialScenarioState, { type: "clear" });
    expect(next).toEqual(initialScenarioState);
  });
});
```

- [ ] **Step 2: Run — expect 2 failures.**

- [ ] **Step 3: Implement.** Replace `case "clear":`:

```ts
    case "clear": {
      return initialScenarioState;
    }
```

- [ ] **Step 4: Run — 15 total passing.**

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/features/sim/scenarioReducer.ts apps/web/src/features/sim/scenarioReducer.test.ts
git commit -m "feat(sim): scenarioReducer clear action"
```

---

## Task 5: `run` action (integration with `simulateScenario`)

**Files:**

- Modify: `apps/web/src/features/sim/scenarioReducer.ts`
- Modify: `apps/web/src/features/sim/scenarioReducer.test.ts`

- [ ] **Step 1: Add failing tests.** Append:

```ts
import { createPmcTarget, type BallisticAmmo } from "@tarkov/ballistics";

const M855: BallisticAmmo = {
  id: "m855-test",
  name: "M855",
  penetrationPower: 31,
  damage: 49,
  armorDamagePercent: 49,
  projectileCount: 1,
};

describe("scenarioReducer — run", () => {
  it("runs the current plan and stores the result", () => {
    const state: ScenarioState = {
      plan: [shot("thorax"), shot("thorax")],
      lastResult: null,
    };
    const next = scenarioReducer(state, {
      type: "run",
      ammo: M855,
      target: createPmcTarget(),
    });
    expect(next.plan).toEqual(state.plan);
    expect(next.lastResult).not.toBeNull();
    expect(next.lastResult!.shots).toHaveLength(2);
    expect(next.lastResult!.killed).toBe(true);
    expect(next.lastResult!.killedAt).toBe(1);
  });

  it("runs an empty plan producing an empty result", () => {
    const next = scenarioReducer(initialScenarioState, {
      type: "run",
      ammo: M855,
      target: createPmcTarget(),
    });
    expect(next.lastResult).not.toBeNull();
    expect(next.lastResult!.shots).toEqual([]);
    expect(next.lastResult!.killed).toBe(false);
  });

  it("leaves the plan untouched when running", () => {
    const state: ScenarioState = {
      plan: [shot("leftLeg"), shot("stomach")],
      lastResult: null,
    };
    const next = scenarioReducer(state, {
      type: "run",
      ammo: M855,
      target: createPmcTarget(),
    });
    expect(next.plan).toBe(state.plan);
  });
});
```

- [ ] **Step 2: Run — expect 3 failures.**

- [ ] **Step 3: Implement.** Replace `case "run":`:

```ts
    case "run": {
      const lastResult = simulateScenario(action.ammo, action.target, state.plan);
      return { ...state, lastResult };
    }
```

- [ ] **Step 4: Run — 18 total passing.**

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/features/sim/scenarioReducer.ts apps/web/src/features/sim/scenarioReducer.test.ts
git commit -m "feat(sim): scenarioReducer run action wires simulateScenario"
```

---

## Task 6: `useScenario` hook

**Files:**

- Create: `apps/web/src/features/sim/useScenario.ts`

No dedicated test file — hook logic is ~15 lines of dispatch wiring; all meaningful behaviour lives in the reducer.

- [ ] **Step 1: Write `useScenario.ts`.**

```ts
import { useCallback, useReducer } from "react";
import type {
  BallisticAmmo,
  PlannedShot,
  ScenarioResult,
  ScenarioTarget,
} from "@tarkov/ballistics";
import { type ScenarioState, initialScenarioState, scenarioReducer } from "./scenarioReducer.js";

/**
 * React hook managing the Ballistics Simulator's scenario state. Wraps the
 * pure `scenarioReducer` and exposes stable action dispatchers.
 *
 * All state mutation flows through the reducer — callers never set plan or
 * lastResult directly, which keeps the Simulator's invariants (length cap,
 * index clamping, reset-on-clear) enforced in one place.
 */
export interface UseScenarioReturn {
  readonly plan: ScenarioState["plan"];
  readonly lastResult: ScenarioResult | null;
  readonly append: (shot: PlannedShot) => void;
  readonly move: (from: number, to: number) => void;
  readonly remove: (index: number) => void;
  readonly clear: () => void;
  readonly run: (ammo: BallisticAmmo, target: ScenarioTarget) => void;
}

export function useScenario(): UseScenarioReturn {
  const [state, dispatch] = useReducer(scenarioReducer, initialScenarioState);

  const append = useCallback((shot: PlannedShot) => dispatch({ type: "append", shot }), []);
  const move = useCallback((from: number, to: number) => dispatch({ type: "move", from, to }), []);
  const remove = useCallback((index: number) => dispatch({ type: "remove", index }), []);
  const clear = useCallback(() => dispatch({ type: "clear" }), []);
  const run = useCallback(
    (ammo: BallisticAmmo, target: ScenarioTarget) => dispatch({ type: "run", ammo, target }),
    [],
  );

  return {
    plan: state.plan,
    lastResult: state.lastResult,
    append,
    move,
    remove,
    clear,
    run,
  };
}
```

- [ ] **Step 2: Typecheck.**

```bash
pnpm --filter @tarkov/web typecheck
```

- [ ] **Step 3: Lint.**

```bash
pnpm --filter @tarkov/web lint
```

- [ ] **Step 4: Commit.**

```bash
git add apps/web/src/features/sim/useScenario.ts
git commit -m "feat(sim): useScenario hook wrapping scenarioReducer"
```

---

## Task 7: Full verification + push + PR

**Files:** none modified.

- [ ] **Step 1: Full monorepo gate (CI parity).**

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm -r build
```

Expected: all green. `pnpm -r build` is non-negotiable — if `apps/web/dist/` fails to build, the deploy would regress.

- [ ] **Step 2: Push.**

```bash
git push -u origin feat/sim-pr2-scenario-hook
```

- [ ] **Step 3: Open PR.**

```bash
gh pr create --title "feat(sim): scenarioReducer + useScenario hook — Simulator PR 2" --body "$(cat <<'EOF'
## Summary

Second PR of the M2 Ballistics Simulator arc. Pure reducer + React hook for the Simulator's shot-plan state. No route or UI yet — the hook is callable from tests and from PR 3's route.

- Adds `scenarioReducer` (append / move / remove / clear / run) in `apps/web/src/features/sim/`.
- Enforces the plan-length cap of 128 on `append` per spec §9.
- `run` action synchronously invokes `simulateScenario` from `@tarkov/ballistics` (shipped in PR 1) and stores the result.
- Adds `useScenario()` hook — ~30 lines of `useReducer` + memoised dispatchers.
- Spec §5.2 reference.

## Test plan

- [x] `pnpm --filter @tarkov/web test -- scenarioReducer` — 18 passing.
- [x] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm -r build` — all green.
- [ ] CI green on this PR.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Wait for CI + merge.**

```bash
gh pr checks --watch
gh pr merge --squash --auto
```

- [ ] **Step 5: Cleanup.**

```bash
cd /mnt/c/Users/Matt/Source/TarkovGunsmith
git worktree remove .worktrees/sim-pr2-scenario-hook
git branch -D feat/sim-pr2-scenario-hook
git fetch origin --prune
```

(Don't `git pull --ff-only` on main if local main is ahead of origin from the spec/plan docs; the next worktree will just base off origin/main.)

---

## Self-review checklist

- [ ] All 5 actions covered by tests (append / move / remove / clear / run).
- [ ] No placeholders.
- [ ] Types match between reducer and hook (`ScenarioState`, `ScenarioAction`).
- [ ] No changes outside `apps/web/src/features/sim/`.
