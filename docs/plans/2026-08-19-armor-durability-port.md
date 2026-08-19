# Plan: port the armor durability formula from `Ballistics.cs`

**Status:** complete — shipped 2026-08-19
**Closes:** [data audit](../operations/data-api-audit.md) follow-up #2, and the `ballistics` half of #3.
**Depends on:** nothing. §B/§C (recoil + accuracy units) shipped in #142.

## Why

`armorDamage()` computes `(armorDamagePercent × materialDestructibility) / 100`, which is
wrong by 35–58× against the original. 9,204 of the live matrix's 9,400 cells (97.9%) return
`Infinity`; no live cell reaches any `shotsToBreakBucket` except "poor". Audit §G has the
measurement.

## Ground truth, re-verified from primary source

Fetched `BackEnd/WishGranter/Statics/Ballistics.cs` from `Xerxes-17/TarkovGunsmith@main`
directly rather than trusting the audit's transcription. The formula matches §G verbatim:

```
blocked    = Max( pen × (ad%/100) × Clamp(pen/armor_class*10, 0.6, 1.1) × destructibility, 1 )
penetrated = Max( pen × (ad%/100) × Clamp(pen/armor_class*10, 0.5, 0.9) × destructibility, 1 )
expected   = P(pen) × penetrated + (1 − P(pen)) × blocked
```

### Two conventions had to be settled, and both were settled by measurement

A JS port of the above was run against the live document (200 ammo × 47 vests) and compared
to the four reference pairs §G records. **Exactly one combination reproduces all four:**

| precedence     | durability scale | M995→6B13 | M995→Zabralo | M995→PACA | 5.45BT→Zabralo |
| -------------- | ---------------- | --------- | ------------ | --------- | -------------- |
| `(pen/cls)*10` | 0–100            | **44** ✅ | **104** ✅   | **22** ✅ | **161** ✅     |
| `(pen/cls)*10` | 0–1              | 44        | 110          | 22        | 186            |
| `pen/(cls*10)` | 0–100            | 44        | 112          | 22        | 271            |
| `pen/(cls*10)` | 0–1              | 44        | 112          | 22        | 271            |

Targets: 44 / 104 / 22 / 161. The same port also reproduces §G's whole-matrix statistics
exactly — zero infinite cells, min 3, median 102, max 510.

1. **Precedence — use the C# reading `(pen/armor_class)*10`.** This does not resolve what the
   original author _intended_; §G is right that nothing in the source settles that. It
   resolves the narrower question of what the ground-truth implementation actually computes,
   which is what a faithful port owes. The ambiguity gets a comment in the code, per the
   audit's instruction that it "must be recorded in the code, not silently resolved".

2. **Durability percentage is 0–100, not 0–1.** `PenetrationChance` derives `factor_a` as
   `(121 − 5000/(45 + durPerc×2)) × class × 0.1`, which only yields the expected ≈`class×10`
   resistance on a 0–100 scale. The C# engine is internally inconsistent here: line 195
   builds `armorDurabilityPercentage` as `(cur/max)*100` for its own `PenetrationChance`
   call, but line 260 passes `cur/max` — a 0–1 fraction — into `GetExpectedArmorDamage`,
   which feeds it to `PenetrationChance` again. On the 0–1 path `factor_a` collapses to
   ≈`1.46×class`, so `P(pen)`≈1 for almost every round and the blend degenerates to the
   penetrated branch. **That is a bug in the original**; it is not replicated, and the
   measurement above confirms §G's reference figures were computed on the 0–100 scale.

## Changes

### `packages/ballistics`

1. **`armorDamage.ts`** — new signature
   `armorDamage(armorDamagePercent, materialDestructibility, penetrationPower, armorClass, penetrationProbability)`.
   Returns the expected-value blend. Exports `armorDamageBlocked` / `armorDamagePenetrated`
   so the two clamp branches stay independently testable. Drops the `didPenetrate` boolean:
   the ground truth blends rather than branching, and the old "if it deflected, half damage"
   had the sign inverted anyway (blocked shots do **1.22×** more, not 0.5×).
2. **`simulateShot.ts`** — pass `penetrationChance`'s probability into `armorDamage` instead
   of the thresholded boolean. `didPenetrate` stays in `ShotResult` for the damage model and
   for callers; only the armor-damage path stops using it.
3. **`penetrationChance.ts`** — left alone. §G quantified it as ~roughly right (verdict flips
   on 5.6% of live cells) and says to fix durability independently. Out of scope, stays open.
4. **Fixtures** — `__fixtures__/ammo.ts` and `__fixtures__/armor.ts` re-baselined onto live
   values sampled 2026-08-19, with ids. Every current value is invented: `M995` is
   pen 53 / ad **52** / dmg **42**, not ad 64 / dmg 49; `PACA_C3` is class **2** / durability
   **100** / Aramid **0.1875**, not class 3 / 40 / 0.55. `KORD_C4` and `SLICK_C6` name items
   that no longer exist as vests and are replaced by real class-4/5/6 entries spanning four
   materials.

### `apps/web`

5. **`shotsToBreakBucket` thresholds** — rebaselined. Current ≤3/≤8/≤15 captures 0.0% / 0.9% /
   3.9% of live cells under correct math. New thresholds track the live quartiles
   (p25 = 16, median = 44, p75 = 108).
6. **`/matrix` "cannot break within 500 shots" copy** — the min-1 floor makes `Infinity`
   unreachable for any armor with `durability ≤ cap` (live max is 510). The branch stays for
   the sub-cap case but stops being the dominant rendering.

### Coverage

`vitest.config.ts` enforces 100% line/function/statement and 95% branch. The clamps and the
floor add branches; tests must cover both clamp rails and the floor on both paths.

## Test plan (TDD — tests first, each one failing for the right reason)

1. `armorDamage` blocked/penetrated match hand-computed ground truth for a mid-range case.
2. Both clamp rails bind — low-pen round pinned to the 0.6/0.5 floor, high-pen to 1.1/0.9.
3. The min-1 floor returns exactly 1 for a buckshot-class round (§G's `CZTL` note).
4. Blocked > penetrated for the same inputs — the 1.22× sign, asserted directly.
5. The blend is monotonic in `P(pen)` and equals each branch at p=0 and p=1.
6. **Regression pinning against ground truth:** the four §G reference pairs, computed from
   live-sampled fixture values, assert 44 / 104 / 22 / 161 shots. This is the test the old
   suite could not have: it is sourced from an independent implementation, not from our own
   output.
7. `armorEffectiveness` no longer returns `Infinity` for any live-shaped fixture pair.
8. Existing `simulateBurst` / `simulateScenario` / `effectiveDamage` / `weaponSpec` tests
   stay green unmodified — §G verified they are unaffected.

## Out of scope, tracked separately

- `penetrationChance` divergence (audit's own instruction to fix independently).
- Plate-era modelling — every one of the 47 live vests carries `armorSlots` with per-slot
  `class`/`durability`/`armorMaterial`, so top-level `class`/`durability` is a rollup. This is
  follow-up #7 and gets an ADR, not a code change here.
- In-game measured pairs (#6) — needs a human in a raid; cannot be produced from data.
