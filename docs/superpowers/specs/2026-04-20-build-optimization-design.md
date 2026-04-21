# Build Optimization — Design Spec

**Date:** 2026-04-20
**Status:** Approved (brainstorming → implementation planning)
**Milestone:** M3 Differentiators — sub-project 3 of 5 (Build optimization)
**Owner:** UnderMyBed (mattshipman85@gmail.com)
**Supersedes:** `docs/superpowers/specs/2026-04-18-tarkov-gunsmith-rebuild-design.md` §13 bullet on Build optimization

## 1. Purpose

Give players a one-click "make this weapon better" button. Hand the optimizer a weapon, a budget, a player profile, and an objective (min-recoil / max-ergonomics / min-weight / max-accuracy), and it returns the provably-optimal mod configuration. Users see a diff preview of what would change, accept or reject, and the accepted build becomes their working Builder state.

The optimizer is a pure-TS constraint solver. It runs client-side on the main thread and finishes in under two seconds for typical Tarkov weapons. It is deterministic — same input, same output, always. Pinned slots give the user explicit control over what the solver is allowed to change.

## 2. Locked decisions (from brainstorming)

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Entry point | **Button on `/builder`** (next to the existing "Compare ↔" button) → modal dialog → diff preview → accept/reject replaces build in-place |
| 2 | Objective | **User picks one** — `min-recoil` (default) / `max-ergonomics` / `min-weight` / `max-accuracy` |
| 3 | Constraints | Budget (₽, optional) + current `PlayerProfile` + **per-slot pin checkboxes** (default: currently-attached slots pinned, unpinned → solver chooses) |
| 4 | Algorithm | **Exact branch-and-bound DFS**, synchronous, main thread, deterministic |
| 5 | Output | **Single optimal build** + diff preview (stat deltas + slot-level diff) |
| 6 | Package | **New `packages/optimizer`** — pure TS, sibling of `@tarkov/ballistics` |
| 7 | Infeasibility | **Typed discriminated-union result** (`ok: false` with a `reason` code) |
| 8 | Timeout | **2000 ms default**, configurable. Returns `partial: true` with best-so-far, or `reason: "timeout"` if nothing found |
| 9 | Recoil semantics | `min-recoil` = minimize `verticalRecoil + horizontalRecoil` (unweighted sum) |

## 3. Non-goals

Explicit scope cuts for this PR:

- **Saved optimization runs.** No `opt:$id` entity, no permalink, no history. If the user wants to keep the result, they save it as a regular build via the existing share flow.
- **Comparing two optimization runs side-by-side.** The user can run optimization twice with different objectives, accept both into separate builds, save them, then use Build comparison — no integrated "A vs. B optimized for different objectives" UI.
- **Weighted multi-objective.** Single objective per run.
- **Allowlist / blocklist of specific items.** Only pin/unpin per slot.
- **Explain-ability.** No "why did it pick this muzzle?" tooltip or trace.
- **Progress indicator during solve.** Synchronous; either it returns fast or the timeout kicks in.
- **Web worker.** Main-thread only for v1. If users hit pathological cases, a worker is a targeted follow-up.
- **Shared pair optimization.** Each side of a `/builder/compare` pair can be optimized independently by loading the pair, opening the optimizer on each side, and re-saving — no direct integration.
- **Sub-tree optimization** (e.g., "optimize just the handguard sub-tree"). The solver runs over the whole tree.
- **Per-stat weights in the UI.** The `min-recoil` objective uses a fixed `verticalRecoil + horizontalRecoil` sum.
- **Anything that requires new `builds-api` endpoints.** Zero Worker changes.

## 4. Package structure & public API

### 4.1 New `packages/optimizer` workspace

Sibling of `@tarkov/ballistics`. Pure TS, no React, no fetch. Extends `tsconfig.base.json`, uses Vitest 4 with `environment: "node"`. Matches the conventions documented in `packages/ballistics/CLAUDE.md`: one function per file alongside its `.test.ts`, TDD strict, JSDoc every public function.

### 4.2 File layout

```
packages/optimizer/
  package.json              # @tarkov/optimizer
  tsconfig.json
  vitest.config.ts
  CLAUDE.md                 # "Pure TS — given inputs produce an optimal build"
  src/
    index.ts                # Re-exports
    types.ts                # OptimizationInput / OptimizationResult / Objective / Constraints
    optimize.ts             # Top-level optimize() function
    optimize.test.ts        # End-to-end tests with fixtures
    branch-and-bound.ts     # DFS core
    branch-and-bound.test.ts
    objective.ts            # Objective → scoring function (pure)
    objective.test.ts
    bounds.ts               # Lower-bound heuristic per objective
    bounds.test.ts
    feasibility.ts          # Pruning checks (budget, availability, pinned-slot compat)
    feasibility.test.ts
    __fixtures__/
      small-weapon.ts       # 3-slot toy weapon for unit tests
      m4a1-like.ts          # Realistic weapon for integration tests
```

### 4.3 Public API

```ts
// packages/optimizer/src/types.ts
import type { BuildV4, PlayerProfile } from "@tarkov/data";
import type { WeaponSpec } from "@tarkov/ballistics";

export type Objective =
  | "min-recoil"         // minimize verticalRecoil + horizontalRecoil
  | "max-ergonomics"
  | "min-weight"
  | "max-accuracy";      // accuracy is MOA-like; lower is better

export interface OptimizationConstraints {
  budgetRub?: number;                              // undefined = no budget cap
  profile: PlayerProfile;                          // determines availability
  pinnedSlots: ReadonlyMap<string, string | null>; // slotPath → itemId (pinned item) | null (pinned empty)
  // Unpinned slots = solver chooses.
}

export interface OptimizationInput {
  weapon: AdaptedWeapon;                           // weapon adapted via @tarkov/web's existing adapter
  slotTree: WeaponTree;                            // from @tarkov/data
  modList: readonly ModListItem[];                 // from @tarkov/data
  constraints: OptimizationConstraints;
  objective: Objective;
  timeoutMs?: number;                              // default 2000
}

export type OptimizationResult =
  | { ok: true; build: BuildV4; stats: WeaponSpec; partial?: boolean }
  | { ok: false; reason: "no-valid-combinations" | "infeasible-budget" | "timeout" };

export function optimize(input: OptimizationInput): OptimizationResult;
```

The `AdaptedWeapon` / `WeaponTree` / `ModListItem` types are the existing exported types from `@tarkov/data` / `@tarkov/web`'s data-adapters. The plan confirms exact import paths and resolves any circular-dep concerns by keeping `@tarkov/optimizer` depending on `@tarkov/ballistics` + `@tarkov/data` (not the other direction).

## 5. Algorithm

### 5.1 Branch-and-bound DFS

1. **Slot ordering.** Flatten the slot tree breadth-first from the root. Reorder by "tightest constraint first" — fewer compatible items per slot = earlier decision = better pruning. Pinned slots go first since their decisions are forced.
2. **Recursive DFS.** For each slot (in order):
   - **Pinned → forced.** Decision is the pinned item (or `null` if pinned-empty). Recurse.
   - **Unpinned → enumerate.** Candidates = (compatible items for this slot) ∩ (items with `itemAvailability(item, profile).available === true`) ∪ `{ null }` (leave empty). For each candidate: update running cost + partial stat accumulator, recurse.
3. **Running state updates.** Cost, partial `WeaponSpec` fields (ergo delta, recoil multipliers, weight addition, accuracy delta), and current partial score.
4. **Pruning.**
   - **Budget cut.** If `runningCost > budgetRub`, prune this branch.
   - **Availability cut.** Skip items where `itemAvailability(...).available === false` during candidate enumeration (except for pinned items — user's explicit choice overrides availability).
   - **Objective lower-bound cut.** For each remaining (unvisited) slot, precompute `bestPossibleDelta[slot]` = the best this slot could contribute to the objective (e.g. for `min-recoil`, the lowest recoil contribution from any compatible item). If `currentPartialScore + Σ bestPossibleDelta[remaining] >= bestCompleteScore`, prune.
5. **Leaf handling.** Recompute full `weaponSpec` from the complete attachment set. Compare to `bestCompleteScore`. If better, update best-so-far. If tied, apply tie-breaker.
6. **Timeout.** Every `N` node visits (e.g. `N = 1000`), check `performance.now() - startedAt > timeoutMs`. If exceeded, stop DFS and return `{ ok: true, build: bestSoFar, stats, partial: true }` — or `{ ok: false, reason: "timeout" }` if `bestSoFar` is still undefined.

### 5.2 Determinism

Same inputs → same result every time. Tie-breaking when two leaf builds have identical objective scores: prefer lowest total price, then lexicographic item-id ordering. Tests assert this across 10 identical runs.

### 5.3 Objective + lower-bound helpers

- **`objective.ts`** — pure `score(objective: Objective, stats: WeaponSpec): number` (smaller = better, regardless of objective polarity). For `max-ergonomics`, score = `-stats.ergonomics` so the DFS minimization logic works for all objectives uniformly.
- **`bounds.ts`** — given the remaining slots and their compat item lists, returns the best possible additional objective-score contribution. This is the pruning engine's teeth; without it, the DFS becomes brute-force.

## 6. Builder integration (apps/web)

### 6.1 New components

Under `apps/web/src/features/builder/optimize/`:

- **`OptimizeDialog`** — full-page modal opened from the "Optimize ⚙" button in `BuildHeader`.
  - **Tab 1 (Constraints):** objective radio group (4 options); budget input (₽, optional, numeric); pinned-slots list as a compact `SlotTree`-like view with a checkbox per slot (default pinned where currently-attached); profile summary (read-only, derived from current `PlayerProfile`); "Run optimization" button.
  - **Tab 2 (Result):** shown after the solver returns.
    - **Success:** `CompareStatDelta` with `left={currentStats}`, `right={optimizedStats}`, plus a `SlotTree` rendered with `diff?: SlotDiffMap` computed from before → after, Accept + Reject buttons.
    - **Failure:** typed message per `reason` ("No valid combinations", "Budget too tight", "Timed out"), "Adjust constraints" button returns to Tab 1.
    - **Partial (timeout with partial result):** same layout as success + a `<Stamp>PARTIAL</Stamp>` reading "PARTIAL — timeout reached; best explored so far."
- **`OptimizeConstraintsForm`** — controlled form component consumed by Tab 1. Emits the full `OptimizationConstraints` shape on submit.
- **`useOptimizer`** — small hook wrapping the synchronous `optimize()`:
  ```ts
  interface UseOptimizerReturn {
    state: "idle" | "running" | "done" | "error";
    result?: OptimizationResult;
    run(input: OptimizationInput): void;
    reset(): void;
  }
  ```
  `optimize()` is synchronous; the `"running"` state exists only to render a brief spinner around the call so clicks feel responsive. In practice most weapons solve in <50 ms; the spinner may never visibly render. That's fine.

### 6.2 BuildHeader changes

- Add optional `onOptimize?: () => void` prop (mirrors the shipped `onCompare?: () => void`).
- Render an "Optimize ⚙" `Button variant="secondary"` alongside "Compare ↔", only when `onOptimize` is provided.
- Button is disabled when no weapon is selected (matches the Compare-button gating we already have).

### 6.3 BuilderPage wiring

`apps/web/src/routes/builder.tsx`:

- Add `const [optimizeOpen, setOptimizeOpen] = useState(false)`.
- Pass `onOptimize={() => setOptimizeOpen(true)}` into `<BuildHeader>`.
- Render `<OptimizeDialog open={optimizeOpen} ... />` below the existing `<CompareFromBuildDialog>`.

### 6.4 On Accept

`OptimizeDialog` fires `onConfirm({ build: BuildV4 })`; `BuilderPage` replaces local state (`attachments`, `orphaned`) with the optimized build's values. Keeps:
- `weaponId` (optimizer doesn't change weapon selection)
- `buildName` / `buildDescription` (user-facing metadata unchanged)
- `embedProfileOnSave` / `profile` (profile-snapshot intent preserved)

Optimizer result's `build.orphaned` will always be `[]` (solver only chooses items valid under the current tree). Dirty flag flips via the existing state-mutation path; user can then save via the existing share flow.

### 6.5 Reused existing pieces

- `statDelta` + `slotDiff` pure helpers (shipped in v1.6.0)
- `CompareStatDelta` component (renders stat rows with direction-aware deltas)
- `SlotTree` with its optional `diff` prop (shipped)
- `Pill`, `Stamp`, `SectionTitle`, `Card variant="bracket"`, `Button`, `Input` from `@tarkov/ui`
- `itemAvailability` from `@tarkov/data` (filters candidate items by profile)
- `weaponSpec()` from `@tarkov/ballistics` (leaf-stat computation)
- `adaptWeapon` / `adaptMod` adapters from `apps/web/src/features/data-adapters/adapters.ts`

## 7. Testing strategy

### 7.1 `packages/optimizer` unit tests

- **Branch-and-bound correctness (`branch-and-bound.test.ts`):** synthetic 3-slot weapon from `__fixtures__/small-weapon.ts` with known combinations; assert `optimize()` returns the hand-computed optimum for each objective.
- **Objective scoring (`objective.test.ts`):** each of the 4 objectives reduces to a deterministic numeric score; asserts the lower-is-better convention holds uniformly.
- **Lower-bound soundness (`bounds.test.ts`):** the lower bound for remaining slots must never exceed the actual optimal completion (otherwise pruning eliminates the real optimum). Test against the small-weapon fixture exhaustively.
- **Feasibility checks (`feasibility.test.ts`):** pinned-slot items respected; unavailable items filtered out; budget rejects over-budget branches.
- **Integration (`optimize.test.ts`):** `m4a1-like.ts` fixture with 8-12 slots and ~5 items each; asserts solver picks the known-min-recoil combination (computed offline and recorded as an expected fixture); tie-breaking determinism (identical inputs → identical output across 10 runs); infeasibility paths (all three failure codes); timeout behavior (1 ms timeout → either `partial: true` or `timeout` reason); all-pinned-slots → immediate return of that fixed configuration's stats.
- **Edge cases:** empty weapon (no slots) returns the weapon as-is; pinned item that's incompatible with the weapon → `{ ok: false, reason: "no-valid-combinations" }`; pinned unavailable item → treated as forced (user's explicit choice wins); profile excluding all items for an unpinned slot → `null` picked for that slot.
- **Recursion guard:** circular slot references are caught by a depth limit (same as the existing recursion-depth-3 guard in `useWeaponTree`). Asserted by a fixture with a deliberately deep tree.

### 7.2 `apps/web` unit tests

- `OptimizeConstraintsForm` reducer (if extracted following the `scenarioReducer` / `compareDraftReducer` pattern): pure function testable without React.
- `useOptimizer` hook: not directly unit-tested per the project convention (hooks are covered by Playwright); it's a 20-line `useReducer` wrapper.

### 7.3 Playwright smoke

- Open `/builder`, select a weapon, click "Optimize ⚙", set objective to `min-recoil`, click "Run optimization". Assert Tab 2 shows stat deltas + Accept button. Click Accept. Assert the Builder's `SlotTree` updated (at least one slot's selected item changed).
- Font-load + console-error guards inherited from existing smoke setup.
- Failure path: craft a scenario with a `budgetRub: 1` constraint to force `infeasible-budget`; assert the error state renders correctly.

## 8. Error handling

- **Solver returns `{ ok: false, reason }`** → Tab 2 renders the failure card with the reason mapped to user-facing copy (e.g. `"no-valid-combinations"` → "No valid build exists under these constraints. Try unpinning a slot or loosening the profile."). Single button: "Adjust constraints" → returns to Tab 1 preserving form state.
- **Solver returns `{ ok: true, partial: true }`** → Tab 2 renders the success card plus a warning `<Stamp>` explaining "Timed out — this is the best found in the available time."
- **JS exception thrown from `optimize()`** (should be impossible, but defensive) → hook catches, sets `state: "error"`, Tab 2 renders a generic error card + retry button.

## 9. Migrations & backward compatibility

- **No schema changes.** `BuildV4` unchanged. No new `builds-api` routes. Optimizer is purely additive.
- **No new Worker secrets or env vars.**
- **No impact on `/builder/$id` save/load, `/builder/compare/*`, or any existing route.**

## 10. Open questions / deferred

- **Nested-slot completion.** The solver enumerates slot decisions breadth-first. Nested slots (slot-of-mod, e.g. a scope mount that exposes a scope slot) are part of the WeaponTree the solver walks. If an optimizer-chosen mod creates new nested slots the user hadn't seen before, those get solved too. Edge case: the new nested slots have no pin defaults (user never saw them). Default: they're unpinned and the solver optimizes them. Tests must cover this.
- **Performance target in the wild.** 2000 ms default timeout is a guess. If real weapons consistently take >500 ms on typical hardware, we'll tighten bounds in a follow-up. Instrument the solver with a final "node visits" count that gets logged in dev mode; not exposed in prod UI.
- **Recoil weighting.** `verticalRecoil + horizontalRecoil` unweighted is the simplest defensible choice; Tarkov vertical is more critical than horizontal and a follow-up could expose a "recoil profile" slider (more vertical vs. balanced). Not in v1.

## 11. Dependencies on other M3 sub-projects

- **Build comparison (shipped v1.6.0)** — optimizer *consumes* `statDelta`, `slotDiff`, `CompareStatDelta`, `SlotTree.diff` as black-box imports. No reverse coupling; Build comparison continues to work unchanged.
- **OG share cards (next sub-project)** — no relationship. The optimizer's result lands as a regular `BuildV4` which becomes shareable via the existing `/builder/$id` flow; OG cards will pick it up automatically when they ship.
- **tarkov.dev profile import (last sub-project)** — no relationship. The optimizer uses whatever `PlayerProfile` is current; when import lands, profiles come pre-populated.

## 12. Acknowledgements

- `packages/ballistics` — provides `WeaponSpec` and `weaponSpec()`, the atomic stat-computation primitive the solver leans on per leaf.
- Build comparison's diff primitives — `statDelta`, `slotDiff`, `CompareStatDelta`, `SlotTree.diff` — are reused wholesale for the result-preview UI. This is a direct payoff of the "share the shipped primitives" design stance from v1.6.0.
