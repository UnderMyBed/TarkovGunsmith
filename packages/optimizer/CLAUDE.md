# `@tarkov/optimizer`

Pure-TypeScript solver for Tarkov weapon builds. Given a weapon, its slot tree, the part
catalog, constraints (profile, budget, pinned slots) and an objective (min-recoil /
max-ergonomics / min-weight / max-accuracy), `optimize` returns the best build exactly: every
required slot filled, no two parts that clash, every pin kept wherever its path exists, inside
the budget — and no such build scores better on the objective, then costs less, then has fewer
parts. When none exists it says why.

## How it works

- `problem.ts` — reduces the input to what the search needs: each reachable part's objective
  figure (an integer in millionths), dispersion key (max-accuracy: the part that sets the
  build's `centerOfImpact` / `deviationMax`), price under the profile, availability and
  conflicts; and each way to buy the weapon (`@tarkov/data`'s `weaponPaths`: the receiver, or a
  preset and the parts it supplies).
- `frontier.ts` / `relaxed.ts` — a keyed Pareto-frontier DP over the slot DAG, memoised per part
  and per slot definition. For a set of constraints it gives the best build on a weapon path that
  ignores part conflicts and preset cover counts: a lower bound. With no budget it keeps one
  point per dispersion key; with one, the (price, figure) frontier.
- `search.ts` — best-first search over constraint sets. The node with the lowest bound is taken
  next; its build's clashes are read with `@tarkov/data`'s `resolveBuild`, the rule the Builder
  flags builds by. A build that breaks nothing is the answer; otherwise the node is split so
  every valid build stays in some child and the broken one in none (see the function's comment
  for the rules). Weapon paths share one search tree, and memoised values carry from a node to
  its children except where a new constraint reaches them.
- `solve.ts` — max-accuracy rates MOA itself, `multiplier(key) × (1 − Σ accuracyModifier)`, and
  first looks for a build whose multiplier is 0, which beats every other.
- `diagnose.ts` — why no build exists, in the order the user can act on: the budget (naming the
  cheapest complete build; the pinned parts nobody prices, when unpinning them gives a build of
  known price; the other pins to lift, when only dropping those does; or else the profile, as the
  failure's `cause`), the pins (naming the ones the build that breaks the fewest breaks, found
  with the pins made soft: a pinned part still sits at its own path), a required slot nothing obtainable fills, parts that come only with the gun and are needed more
  often than any way to buy it supplies them, or parts that cannot be fitted together.
- `pins.ts` — which pins the build keeps, and why it drops the rest.

Prices follow `@tarkov/data`'s `buildPriceUnder` rule: the weapon by its cheapest path plus
every part that path does not supply. An unknown price never fits a budget, and ranks after any
known one.

## What it assumes of the data

`pnpm verify:upstream` checks each of these against the live document:

- the slot graph has no cycle (the DP throws on one);
- no build can hold two parts that set dispersion (the DP throws on one);
- `centerOfImpact` is never negative, so for every barrel a higher summed `accuracyModifier` is a
  lower MOA;
- a build's summed `accuracyModifier` stays inside (−1, 1), so no MOA is negative.

The max-accuracy objective is exact for MOA as `weaponSpec` computes it, but the
`(1 − Σ accuracyModifier)` factor itself **has no upstream oracle**: upstream's preset `moa` leaves
accuracy modifiers out, so nothing confirms the factor matches the game.

## Conventions

- **Pure functions.** Same inputs, same output. The only clock read is `Date.now()` against the
  `timeoutMs` safety net (default 2 s), which returns `timeout` with no partial build. The
  optional `onProgress` callback observes how many candidate builds the run has checked; it
  never changes the result. The Builder runs `optimize` in a Web Worker
  (`apps/web/src/features/builder/optimize/optimize.worker.ts`).
- **Tests:** unit tests per module; `solve.property.test.ts` checks 400 random problems against
  a brute-force oracle; `goldens.test.ts` runs real M4A1, AKM and RSASS records
  (`src/__fixtures__/goldens.json`, written by `scripts/optimizer-goldens.ts`) and pins the
  optima an independent MILP found. Coverage is enforced at 100% lines, branches, functions and
  statements.
- **No React.** UI integration lives in `apps/web/src/features/builder/optimize/`.

## Out of scope

- Fetching game data (that's `@tarkov/data`).
- Stat computation (that's `@tarkov/ballistics` — the result's `stats` come from `weaponSpec`).
- UI / React / dialogs (that's `apps/web`).
- Caching or persistence — callers handle that.
