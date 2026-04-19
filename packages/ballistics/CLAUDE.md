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
