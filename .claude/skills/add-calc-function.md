---
name: add-calc-function
description: Use when adding a new ballistic or armor calculation to packages/ballistics. Enforces TDD — writes the failing test first against curated fixtures (cross-checked vs. original C# WishGranter outputs where available), then the minimal implementation. No game data is hardcoded; all inputs are typed args.
---

# add-calc-function

## When to use

Adding any pure-math function to `packages/ballistics/src/` — penetration, damage falloff, armor degradation, weapon-spec aggregation, etc.

## What it does (in order)

1. Asks: "What is the function name, signature, and one-paragraph description?"
2. Writes `packages/ballistics/src/<area>/<name>.test.ts` with at least 3 fixture cases:
   - One nominal case (typical input)
   - One edge case (zero, max, boundary)
   - One regression case cross-checked against the original C# `WishGranter` output (if available — otherwise marked `// SOURCE: in-game wiki [link]`)
3. Runs the test, confirms it fails for the right reason ("function not defined" or "module not found").
4. Writes the minimal implementation in `packages/ballistics/src/<area>/<name>.ts`.
5. Re-runs the test, confirms green.
6. Adds an export to `packages/ballistics/src/index.ts`.
7. Commits as `feat(ballistics): add <name>`.

## Hard rules

- No game data hardcoded inside the function. All ammo/armor stats are arguments.
- All numeric outputs must be deterministic given inputs (no `Math.random()` — pass an RNG if needed).
- Every function MUST have a JSDoc block with one example.
- Coverage target: 100% lines.

## Out of scope

- React components that render the result. Those use `add-feature-route`.
- Caching or memoization. The functions are pure; callers memoize via TanStack Query or `useMemo`.
