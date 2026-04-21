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
  tie-breaking: lowest total price, then lexicographic attachment-key order.
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
