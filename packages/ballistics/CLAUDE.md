# `@tarkov/ballistics`

Pure-TypeScript math for ballistic and armor calculations. Used by `apps/web` (and potentially Workers) to compute damage, penetration, durability, and weapon stats from typed inputs.

## What's in this package

- `simulateShot(ammo, armor, distance)` → `ShotResult`
- `simulateBurst(ammo, armor, shots, distance)` → `ShotResult[]`
- `armorEffectiveness(ammos, armors)` → `number[][]` (shots-to-penetrate matrix)
- `weaponSpec(weapon, mods)` → `WeaponSpec`
- Helpers: `penetrationChance`, `armorDamage` (+ `armorDamageBlocked` / `armorDamagePenetrated`), `effectiveDamage`

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

The original is **live and is the ground truth**: `BackEnd/WishGranter/Statics/Ballistics.cs`
in [Xerxes-17/TarkovGunsmith](https://github.com/Xerxes-17/TarkovGunsmith). An earlier note in
`docs/plans/` claiming it was "archived as defunct" was wrong. Read it before changing any
armor math.

`src/armor/groundTruth.test.ts` pins our output against four reference pairs derived from it.
Treat that file as a contract: if a change moves those numbers, the change is wrong until
proven otherwise.

**Fixtures must carry live values, not plausible ones.** Every fixture in `__fixtures__/`
is sampled from `json.tarkov.dev` and carries the real upstream item `id` so it can be
re-checked. Inventing "representative" numbers is what allowed a 100× recoil error and a 35–58×
durability error to pass a fully green suite — see `docs/operations/data-api-audit.md` §B and §G.

## Out of scope

- Fetching game data (that's `@tarkov/data`).
- React components or UI (that's `apps/web`).
- Caching or memoization — callers handle that with TanStack Query or `useMemo`.
