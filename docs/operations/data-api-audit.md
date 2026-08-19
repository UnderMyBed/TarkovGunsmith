# Data API audit — json.tarkov.dev vs. our calculations

**Audited:** 2026-08-18, against live `https://json.tarkov.dev/regular/` (items document 16.7 MB raw, 5,312 items).
**Scope:** every field the app reads from the upstream API, from transport through to the numbers rendered on each route.
**Trigger:** the GraphQL → JSON migration in #113 (`30e2671`) moved every query onto a new document shape. This audit checks what that move did, and what it revealed.

## Verdict in one line

The **migration itself is clean** — 100% parse rate on every fetcher, no silent drops, no missing fields.

What it surfaced instead are **three pre-existing calculation defects, none caused by the migration and all of them severe**: recoil is 100× too weak (§B), the accuracy stat is unit-wrong _and_ sign-inverted so the optimizer's `max-accuracy` objective selects for the worst accuracy (§C), and armor durability is wrong by 35–58×, rendering 97.9% of `/matrix` meaningless (§G).

They share one cause. Every fixture in the affected packages carries **invented magnitudes that cannot occur upstream** — recoil values 43× larger than the real maximum, armor destructibility values belonging to no material in either table — so the suite passes at 100% while the math is wrong by two orders of magnitude. A test suite built on impossible inputs cannot detect a unit error.

---

## A. Migration fidelity — clean

Every production fetcher was run against the live document and compared against the raw upstream type counts.

| Fetcher           | Kept  | Upstream of that type           | Rate                    |
| ----------------- | ----- | ------------------------------- | ----------------------- |
| `fetchAmmoList`   | 200   | 200 `ItemPropertiesAmmo`        | 100%                    |
| `fetchArmorList`  | 47    | 47 `ItemPropertiesArmor`        | 100%                    |
| `fetchWeaponList` | 171   | 171 `ItemPropertiesWeapon`      | 100%                    |
| `fetchModList`    | 1,638 | 1,638 `ItemPropertiesWeaponMod` | 100%                    |
| `fetchTraders`    | 7     | 7 profile traders               | 100%                    |
| `fetchTasks`      | 517   | —                               | all trader ids resolved |

Zero items of a targeted type are dropped by `safeParse`. Checked separately: **no required field is null or absent on any item** of any consumed type — the Zod schemas are safe against the current document.

Also verified sound:

- **Translation merge.** `mergeTranslations` resolves correctly; category names go from the raw key `"5447b5f14bdc2d61278b4567 Name"` to `"Assault rifle"`.
- **Armor material join.** All 5 material ids used by armor (`Aramid`, `Aluminium`, `Combined`, `ArmoredSteel`, `UHMWPE`) resolve against `armorMaterials`; zero unresolvable. Destructibility range 0.1875–0.525.
- **`buyFor` reconstruction.** 1,451/1,638 mods get a trader offer, 1,602 a flea offer, 26 offers carry a resolved `taskUnlock`. Only 36 mods have no source at all. Trader distribution (peacekeeper 433, mechanic 426, skier 321) is plausible for weapon mods.
- **Weapon base stats are the bare receiver**, which is what the Builder wants. Upstream now returns `defaultErgonomics` / `defaultRecoilVertical` / `defaultRecoilHorizontal` as **`null`**, so reading the non-`default` fields is both correct and the only option.
- **Weapon tree.** M4A1 resolves to 6 top slots / 2,293 nodes.

---

## B. Defect: recoil is calculated 100× too small

**Severity: high. User-visible on every route that shows recoil. Pre-existing — not caused by the migration.**

### The unit mismatch

Upstream `ItemPropertiesWeaponMod.recoilModifier` is a **fraction**, not a percent. Live range across all 1,638 mods is `-0.35 … 0`.

The evidence is unambiguous — the AK-74 polymer stock is **−21% recoil in game**, and upstream reports `-0.21`. Dozens more line up the same way (Magpul UBR GEN2 `-0.225`, AKM wooden stock `-0.22`, M870 Magpul SGA `-0.29`).

But `adapters.ts` maps it straight into a field documented as a percent:

```ts
// EFT's `recoilModifier` is already a percent (e.g. -8 for an 8% recoil
// reduction), so it maps directly to `recoilModifierPercent`.   <-- wrong
recoilModifierPercent: item.properties.recoilModifier,
```

and `weaponSpec` then divides by 100:

```ts
const recoilMultiplier = 1 + recoilSumPercent / 100;
```

So a −21% stock is applied as **−0.21%**.

### Measured impact

Colt M4A1 (base vertical recoil 119) with Magpul UBR GEN2 stock + Hera Arms CQR grip + DD RIS II handguard — a sum of `-0.455`, i.e. a real **−45.5%**:

|                           | As shipped | Correct |
| ------------------------- | ---------- | ------- |
| Vertical recoil           | **118.46** | 64.85   |
| Horizontal recoil         | **340.44** | 186.39  |
| Effective reduction shown | **0.46%**  | 45.50%  |

Vertical recoil is **overstated by 83%**, and mods appear to do essentially nothing.

### Why no test caught it

The fixtures use invented percent-scale values that never occur upstream. `adapters.test.ts` asserts on `recoilModifier: -15` — 43× larger than the real-world maximum of `-0.35` — and only checks that the value passes through unchanged. The pre-migration fixture, by contrast, used a realistic `-0.01`, confirming the GraphQL API returned fractions too. **The scale was always wrong; the migration didn't change it.**

### Blast radius

| Site                                         | Effect                                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `apps/web/.../adapters.ts` `adaptMod`        | Root cause. Feeds Builder, `/calc`, compare.                                                   |
| `packages/og/src/hydrate.ts`                 | Same mapping — OG share cards show wrong recoil.                                               |
| `packages/optimizer/.../branch-and-bound.ts` | Same mapping in `adaptModListItem`.                                                            |
| `packages/optimizer/src/bounds.ts`           | `baseRecoil * (sumPercent / 100)` — same error in the search bound.                            |
| `apps/web/src/routes/data.tsx`               | Column literally labelled **"Recoil %"** renders the raw fraction, so `-0.21` reads as −0.21%. |

**The optimizer still picks the right mods.** Its score function and its bound use the same (wrong) scale consistently, and both are monotonic in the sum of `recoilModifier`, so the argmin is unchanged. Only the _reported_ stats are wrong. There is no recoil _constraint_ in `OptimizationConstraints` that could be evaluated in the wrong unit.

### Note for whoever fixes this

It is not a one-character change. Multiplying by 100 at the adapter is correct in isolation, but `weaponSpec`'s `1 + sum/100` can then approach zero: the best top-level-only sum is already `-0.73` on an AK-74N, and nested handguard/foregrip slots push further. A clamp (and a decision about `/data`'s "Recoil %" column) belongs in the same change.

---

## C. Secondary defect: `accuracyModifier` is also a fraction

Live range `-0.05 … 0.06` (i.e. ±3–6%), but `adaptMod` adds it directly to a **MOA** baseline:

```ts
accuracyDelta: item.properties.accuracyModifier,   // 0.05  -> "+0.05 MOA"
```

Dimensionally wrong — a 5% accuracy change is applied as 0.05 MOA.

### The sign is also inverted, and it has a live consequence

Checked against the live document, the positive end of the range is precision hardware — SV-98 SRVV muzzle brake `+0.06`, M700 AI AT AICS chassis `+0.06`, Magpul PRS GEN2/GEN3 stocks `+0.05` — and the negative end is suppressors: Mosin Bramit `-0.05`, Norinco VQX-191 `-0.05`, PBS-1 `-0.03`.

So **positive `accuracyModifier` means better accuracy, i.e. smaller MOA.** `weaponSpec` adds it to a lower-is-better MOA figure, which reverses it.

That is not cosmetic. The optimizer's `max-accuracy` objective minimises `stats.accuracy` and picks the **smallest** `accuracyModifier` per slot — so **"maximise accuracy" selects suppressors and rejects precision stocks.** The objective does the opposite of its name.

The correct model is `baseAccuracy × (1 − Σaccuracy)`, with the optimizer's bound and per-item score flipped to match. Note that `baseAccuracy` remains the fabricated constant `DEFAULT_BASE_ACCURACY = 3.5` rather than real data, so fixing the unit and sign makes the stat _coherent_, not _sourced_ — whether it should ship at all is still open.

---

## D. Correct as-is — verified, no action

- **`armorDamage` is a percent (0–95 live)** and maps correctly to `armorDamagePercent` (0–100). Cross-checked: M995 reports `armorDamage: 52`, `penetrationPower: 53`, matching in-game values.
- **Armor `class` (2–6) and `durability` (80–510)** map straight through.
- **Material destructibility** resolves through the new `armorMaterials` lookup exactly as intended, including the deliberate choice to use the entry `id` (`"Aramid"`) rather than upstream's `name` (`"MatAramid"`).

---

## E. Upstream data we now have but don't use

The JSON API exposes considerably more than the GraphQL selections did. None of this is a defect; it is the option list for future work.

- **Weapon presets are available upstream.** `WEAPON_PRESETS` in `presets.ts` is a hand-curated map that is still empty, with a comment promising a content PR. Upstream ships **484 `ItemPropertiesPreset` items**, and each weapon carries a `presets` array plus a `defaultPreset` id (M4A1 has 18). The deferred "weapon preset content" item can be sourced rather than hand-written.
- **Ammo fields we ignore:** `penetrationChance`, `fragmentationChance`, `ricochetChance`, `durabilityBurnFactor`, `lightBleedModifier`, `heavyBleedModifier`, `initialSpeed`, `ballisticCoeficient`, `bulletMassGrams`, plus ammo's own `recoilModifier` and `accuracyModifier`. Several deferred M2 items (bleed, probabilistic mode) have upstream data waiting. Note upstream ships its own `penetrationChance` (live range 0–0.92) where we compute our own from a wiki-derived formula.
- **Weapon fields we ignore:** `fireModes`, `effectiveDistance`, `sightingRange`, `recoilAngle`, `recoilDispersion`, `cameraSnap`, `centerOfImpact`, `deviationCurve`, `deviationMax`, `allowedAmmo`, `defaultAmmo`. (`fireRate` is fetched but only displayed on `/data` — it feeds no calculation.)
- **83 `ItemPropertiesArmorAttachment` items** — armor plates and face shields, classes 1–6 — are absent from `/calc`'s armor list, which only reads the 47 `ItemPropertiesArmor` vests. 109 helmets are also excluded (a known deferred item).

---

## F. Findings that change deferred work

- **`allowedCategories` slot filtering is not implementable as specified.** It is listed as a deferred M1.5 item, but **all 3,564 slots in the live document have an empty `allowedCategories`**. The resolution code in `weaponTree.ts` is correct and simply has nothing to resolve. `itemCategories` (112 entries) is populated, but nothing references it from a slot filter. This item should be reframed or dropped rather than scheduled.
- **Flea market level gating is parsed but never enforced.** `resolveBuyFor` correctly maps `minLevelForFlea` onto `vendor.minPlayerLevel`, but `itemAvailability` never reads it — and `PlayerProfile` has no player-level field at all (only `mode`, `traders`, `flea`, `completedQuests`). Live: **778 of 1,638 mods carry a flea requirement** (615 at level 20, 163 at level 25) that is silently ignored. With `flea: true`, a level-1 profile is told it can buy all of them.
- **`RECURSION_DEPTH = 3` is now a free parameter.** The comment correctly records that the limit existed because depth 4 returned ~7.5 MB over the wire for the M4A1. That constraint is gone — resolution is client-side over an already-loaded document. Raising it is now a cost-free behaviour decision.

---

## G. Armor durability is wrong by 35–58× — verified against the original C#

**Severity: high. 97.9% of `/matrix` is meaningless. Pre-existing, not a mapping issue — both inputs arrive correctly.**

> **Correction (2026-08-19).** The first version of this section computed `0.130` pts/shot → 1,562 shots. That used a placeholder destructibility of `0.25` from before the real value was fetched, while citing the correct `0.1875` in the same sentence. The real figures are below; the original understated the defect. A follow-up investigation then found the ground truth, which this section now records instead of the earlier hypothesis.

### The measured defect

`armorDamage()` computes `(armorDamagePercent × materialDestructibility) / 100`. Running the **shipped compiled code** against the live document:

| Case                               | Shipped         | WishGranter (ground truth) | Error |
| ---------------------------------- | --------------- | -------------------------- | ----- |
| M995 → 6B13 (cls 4, dur 203)       | **2,083 shots** | 44                         | 47×   |
| M995 → Zabralo-Sh (cls 6, dur 510) | **5,231 shots** | 104                        | 50×   |
| M995 → PACA (cls 2, dur 100)       | **1,026 shots** | 22                         | 47×   |
| 5.45 BT → Zabralo-Sh               | **9,376 shots** | 161                        | 58×   |

Across the full live matrix (200 ammo × 47 armor = 9,400 cells) at the default 500-shot cap: **9,204 cells (97.9%) return `Infinity`.** `shotsToBreakBucket` buckets ≤3 great / ≤8 good / ≤15 fair — **no live cell reaches any bucket except "poor".** `/aec` and `/charts` cap at 30 shots, so every ammo classifies "ineffective". Under the correct formula there are **zero** infinite cells (min 3, median 102, max 510).

### The ground truth exists, and the repo's own note about it was wrong

`docs/plans/2026-04-19-packages-ballistics-plan.md` says the C# original is "archived as defunct; we'd need to spin it up to compare. Defer until needed." **That premise is false.** [`Xerxes-17/TarkovGunsmith`](https://github.com/Xerxes-17/TarkovGunsmith) is live, default branch `main`, last pushed 2025-12-17, with commits to the ballistics file through 2025-12-10 — including one titled _"Fixed durability bugs"_. The math is in `BackEnd/WishGranter/Statics/Ballistics.cs`, self-documented as "gleaned from reverse regression analysis of a big data set of test results from in-game":

```
blocked    = Max( pen × (armorDamage%/100) × Clamp(pen/armor_class*10, 0.6, 1.1) × destructibility, 1 )
penetrated = Max( pen × (armorDamage%/100) × Clamp(pen/armor_class*10, 0.5, 0.9) × destructibility, 1 )
expected   = P(pen) × penetrated + (1 − P(pen)) × blocked
```

Its material table is byte-identical to the live API's.

**No numeric reference values exist on either side.** The C# test file's 28 assertions are all `IsNotNull` / `Count > 0`; no in-repo fixture carries a WishGranter annotation at any commit in history. The implementation _is_ the ground truth.

### The obvious hypothesis is directionally right and materially incomplete

Penetration power is indeed the missing factor — but adding it alone still misses the **clamp term**, the **min-1 durability floor**, and the **expected-value blend** of blocked/penetrated (the shipped code branches binary instead). Measured across all 8,930 live cells with `pen > 0, ad > 0`: within 10% of ground truth on 66.3% of cells, within 25% on 74.4%, **worst-case relative error 26,568%** — the tail is low-penetration rounds, where the min-1 floor dominates. Shipping the hypothesis would fix the headline and leave a long tail badly wrong.

**Separate sign defect:** `armorDamage()` halves damage on deflection ("If it deflected, half damage"). The original has the **opposite sign** — blocked shots damage armor **1.22× more** than penetrating ones (clamp ceiling 1.1 vs 0.9).

### RESOLVED IN THE PORT (2026-08-19) — read this before touching the formula

The port landed. Three things were established that this section could not settle when it
was written, all by running a direct port against the live document and comparing to the
four reference pairs above:

1. **The precedence question is settled _for the port_, not for intent.** Only the C# reading
   `(pen/class)*10` reproduces all four reference pairs (44 / 104 / 22 / 161) and the
   whole-matrix statistics (zero infinite, min 3, median 102, max 510). The `pen/(class*10)`
   reading misses on two of four. The port therefore takes the C# reading, and says so in
   `armorDamage.ts`. **What the original author intended is still unknown** and the code
   comment keeps that distinction.

2. **A second unit bug exists in the ground truth itself, and is NOT replicated.**
   `PenetrationChance` takes durability on a 0–100 scale — `CalculateFactor_A` only yields the
   expected ≈`class × 10` resistance there. `SimulateHitSeries_Engine` builds exactly that at
   line 195 for its own call, but at line 260 passes `currentDurability / MaxDurability` — a
   0–1 fraction — into `GetExpectedArmorDamage`, which feeds it to `PenetrationChance` again.
   On the 0–1 path `factor_a` collapses to ≈`1.46 × class`, so `P(pen)` ≈ 1 for nearly every
   round and the expected-value blend degenerates into the penetrated branch. The 0–100 scale
   is what reproduces the reference figures, so that is what shipped.

3. **Under the C# reading the lower clamp rails are mathematically unreachable.** They engage
   only when `pen < 0.06 × class` (≤ 0.36 at class 6), where the product cannot exceed
   `0.36 × 1.0 × 0.6 × 0.525 = 0.113` and the min-1 floor always wins. The clamp ceiling
   saturates on 95.0% of live cells, so in practice the clamp is a constant multiplier rather
   than the modulating term it reads as. The rails are kept, commented, and covered by a test —
   they go live the moment the precedence reading changes.

Residual known gap: `penetrationChance` is still ours (a linear ramp), not the original's
`factor_a` curve, per this section's own instruction to fix it independently. Measured cost
against ground truth across the live matrix: **1.75% mean relative error, 25% worst case**;
on the four reference pairs, at most 4.8%. `groundTruth.test.ts` pins both the exact matches
and that bound.

One further defect found while porting, not previously recorded: `/matrix` capped simulation
at 500 shots while the highest live vest durability is **510**. Since the min-1 floor bounds
shots-to-break by durability, 139 of the 9,400 live cells (1.5%) would have rendered as
unbreakable purely because the cap sat below the maximum durability. The cap is now 520.

### One genuinely unresolved ambiguity — do not let anyone settle this silently

`pen / armor_class * 10` under C# precedence is `(pen/class)*10`, which saturates the clamp to a near-constant 0.9 on 8,930 of 9,400 live cells. Read as `pen/(class*10)` it becomes a real modulating term spanning 0.50–0.90. **The two readings agree on only 30.0% of live cells**, and nothing in the source settles it. A faithful port takes C# precedence, because that is what the ground-truth implementation actually computes — but whether the original author intended it is unknown.

### What a fix breaks

Current suite: 66/66 green. The defect is baked into the fixtures, so this is not a regression — it never worked.

- `armor/armorDamage.test.ts` — **all 5 cases.** The signature must gain `penetrationPower` and `armorClass`. Two contradict the min-1 floor outright (`armorDamage(0, 1.0, true)` and `armorDamage(80, 0, true)` both expect `0`; the floor yields `1`). The deflection case inverts sign.
- `armor/armorEffectiveness.test.ts` — **enshrines the bug in its own comment**, spelling out the defective arithmetic verbatim and asserting `Infinity` for a cell that is 21 shots under ground truth. The min-1 floor makes `Infinity` unreachable for any armor with `durability ≤ cap` (live max is 510), so that branch and `/matrix`'s "Cannot break within 500 shots" copy become near-dead code.
- `shot/simulateShot.test.ts` — three numeric assertions.
- Survives unchanged, verified rather than assumed: `simulateBurst`, `simulateScenario`, `penetrationChance`, `effectiveDamage`, `weaponSpec`, `defaults`, `index`, and every `apps/web` consumer including `rankAmmos` and `colors`.
- **Non-test blockers:** `vitest.config.ts` enforces 100% line/function/statement coverage and 95% branches, and the clamps and floor add branches. `shotsToBreakBucket` thresholds need rebaselining. And the armor fixtures are **invented, exactly as §B found for recoil** — `PACA_C3` is class 3 / durability 40 / destructibility 0.55, where live PACA is class 2 / durability 100 / Aramid 0.1875, and the destructibility values 0.55/0.5/0.45/0.4 exist for no material in either table.

### Confidence

- **Shipped formula is wrong by 35–58×:** very high — shipped code executed against live data, plus an independent ground-truth implementation.
- **`Ballistics.cs` is the intended target:** high — it is the actual source this project was rebuilt from, actively maintained through Dec 2025.
- **That it is correct for the _current_ game:** **moderate, and this is where to stop short.** It is a regression fit with no recorded game version, and it splits plate vs. soft layers (`PlateMaxDurability` / `SoftMaxDurability`) while `BallisticArmor` models one monolithic layer. Live upstream now ships `armorSlots` and `bluntThroughput`, which we do not read at all.
- **The precedence ambiguity: unresolved.** Not guessed.

**What would raise confidence:** 5–10 in-game measured pairs (known armor, known ammo, count the hits) would discriminate the two precedence readings decisively and validate the fit against the current patch. Failing that, stored `BallisticTest` records from the original's DB layer would be real expected values.

### Adjacent, quantified so it is not conflated

`penetrationChance` also diverges from the original (ours is a linear ramp; the original uses `factor_a = (121 − 5000/(45 + durPerc×2)) × class × 0.1`). Mean absolute difference 0.052, but the binary `didPenetrate` verdict flips on only **5.6%** of live cells. That model is roughly right; the durability defect dominates and should be fixed independently.

## How to re-run this audit

```bash
# 1. Pull the live documents
cd "$(mktemp -d)"
for r in items tasks traders; do
  curl -sS --compressed -o $r.json    https://json.tarkov.dev/regular/$r
  curl -sS --compressed -o ${r}_en.json https://json.tarkov.dev/regular/${r}_en
done

# 2. Confirm the document shape hasn't moved
node -e "const d=require('./items.json'); console.log(Object.keys(d), Object.keys(d.data))"
#   expect: [ 'data', 'translations' ]  and  data.items / data.armorMaterials / data.itemCategories

# 3. Type histogram — a new ItemPropertiesX variant is the signal that a fetcher needs updating
node --max-old-space-size=4096 -e "
const items=Object.values(require('./items.json').data.items), h={};
for (const i of items) h[i?.properties?.propertiesType ?? '(none)'] = (h[i?.properties?.propertiesType ?? '(none)']||0)+1;
console.log(Object.entries(h).sort((a,b)=>b[1]-a[1]));"

# 4. Unit sanity — these MUST stay on the scales this audit recorded
node --max-old-space-size=4096 -e "
const items=Object.values(require('./items.json').data.items);
const r=items.filter(i=>i?.properties?.propertiesType==='ItemPropertiesWeaponMod').map(i=>i.properties.recoilModifier);
console.log('recoilModifier range', Math.min(...r), Math.max(...r), '(expect fraction: -0.35..0)');
const a=items.filter(i=>i?.properties?.propertiesType==='ItemPropertiesAmmo').map(i=>i.properties.armorDamage);
console.log('armorDamage range  ', Math.min(...a), Math.max(...a), '(expect percent: 0..95)');"
```

A parse-rate check needs the real fetchers driven by a client reading those files — the same harness this audit used.

**The scheduled contract test now exists.** `scripts/verify-upstream-contract.ts`
(`pnpm verify:upstream`, and the `Upstream contract` workflow weekly on Mondays) fetches the
live document and asserts:

- the document shape (`data.items` / `data.armorMaterials` / `data.itemCategories`);
- the unit scales this audit recorded — `recoilModifier` a fraction, `accuracyModifier` a
  fraction with at least one positive value, `armorDamage` a percentage;
- the bounds the durability port's clamp analysis depends on (armor class ≤ 6,
  destructibility ≤ 1);
- every fixture field in `ballistics`, against the live item of the same id.

It is deliberately **not** in `pnpm test`: a network call in the pre-merge gate would fail PRs
on upstream's availability rather than on our code. Failures alert through the existing
`Scheduled failure alert` watcher.

Its first run confirmed every scale in this document unchanged: `recoilModifier` [-0.35, 0],
`accuracyModifier` [-0.05, 0.06], `armorDamage` [0, 95], Aramid 0.1875.

## Recommended follow-ups, in priority order

1. ~~**Fix the recoil unit error and the accuracy unit + sign errors** (§B, §C)~~ — **done.** Both now carry upstream's native fraction, and the accuracy sign is inverted at the point of application.
2. ~~**Port the armor durability formula from `Ballistics.cs`** (§G)~~ — **done.** Ported with the C# precedence reading, the ambiguity recorded in `armorDamage.ts` rather than silently resolved, and pinned against the four ground-truth reference pairs. See "RESOLVED IN THE PORT" above.
3. ~~**Re-baseline every fixture in `ballistics`, `optimizer` and `og` against sampled live data.**~~ — **done, and now enforced.** `ballistics` and `og` fixtures carry live values with real upstream ids; `optimizer`'s are synthetic by construction (generated slot mods sized for a hand-verifiable search space) but were moved onto upstream's unit scale. Verified by machine rather than by reading: `pnpm verify:upstream` fetches the live document and diffs every fixture field against it. **This closes the root cause** — the suite can no longer be green while its inputs are impossible.
4. ~~**Enforce or drop flea level gating** (§F)~~ — **done.** `PlayerProfile` gained a `level`, and availability now reports a `flea-level-required` state.
5. **Reframe or drop the `allowedCategories` deferred item** (§F) — there is no upstream data for it.
6. **Get 5–10 in-game measured armor pairs.** Settles the §G precedence ambiguity and validates a 2025-era regression fit against the current patch. Nothing in either repo can substitute for it.
7. **Decide whether to model armor plates at all** (§G) — upstream ships `armorSlots` and `bluntThroughput`; porting single-layer math onto plate-era data may be the larger correctness question hiding behind the durability defect.
