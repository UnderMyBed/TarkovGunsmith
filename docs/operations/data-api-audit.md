# Data API audit — json.tarkov.dev vs. our calculations

**Audited:** 2026-08-18, against live `https://json.tarkov.dev/regular/` (items document 16.7 MB raw, 5,312 items).
**Scope:** every field the app reads from the upstream API, from transport through to the numbers rendered on each route.
**Trigger:** the GraphQL → JSON migration in #113 (`30e2671`) moved every query onto a new document shape. This audit checks what that move did, and what it revealed.

## Verdict in one line

The **migration itself is clean** — 100% parse rate on every fetcher, no silent drops, no missing fields. But the audit surfaced a **pre-existing 100× unit error in the recoil calculation** that predates the migration and is now precisely quantified.

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

Dimensionally wrong — a 5% accuracy change is applied as 0.05 MOA. Lower practical impact than recoil, because `baseAccuracy` is already the fabricated constant `DEFAULT_BASE_ACCURACY = 3.5` rather than real data, so the accuracy column is decorative either way. Worth fixing alongside recoil, and worth deciding whether an accuracy stat sourced from a hardcoded constant should be shown at all.

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

## G. Adjacent observation — armor durability model (pre-existing, not a mapping issue)

Not caused by the migration, and not a data defect: both inputs arrive correctly. Recording it because a data audit is where the arithmetic becomes visible.

`armorDamage()` computes `(armorDamagePercent × materialDestructibility) / 100`. With real live values — M995 (`armorDamage: 52`) against a 6B13 class 4 Aramid vest (`durability: 203`, destructibility `0.1875`):

```
(52 × 0.1875) / 100 = 0.130 durability points per shot
203 / 0.130       = 1,562 shots to break
```

In game this is on the order of tens of shots. The same arithmetic gives 3,924 shots for Zabralo-Sh and 834 for a PACA. This makes `shotsToBreak` — surfaced on `/matrix`, `/charts` and `/aec`, and armor damage on `/calc` and `/adc` — effectively unbounded across the board.

The formula appears to be missing the penetration-power term; including it (`53 × 0.52 × 0.1875 ≈ 5.2` pts/shot → ~39 shots) lands in a plausible range. **This needs verification against the original WishGranter C# before anyone changes it**, which is exactly what the `ballistics-verifier` agent exists for. Flagged, not fixed.

---

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

A parse-rate check needs the real fetchers driven by a client reading those files — the same harness this audit used. **Automating it as a scheduled contract test is the recommended follow-up**, and is what would have caught the unit error years earlier: the current suite passes precisely because its fixtures are invented rather than sampled from upstream.

## Recommended follow-ups, in priority order

1. **Fix the recoil unit error** (§B) — high severity, user-visible everywhere, needs a clamp decision. Re-baseline the fixtures on real upstream values in the same change.
2. **Re-baseline all test fixtures against sampled live data**, so invented magnitudes can't hide a unit bug again.
3. **Fix or remove `accuracyModifier`** (§C), and decide whether a hardcoded-baseline accuracy stat should ship.
4. **Enforce or drop flea level gating** (§F) — either add a level to `PlayerProfile` or stop parsing `minLevelForFlea`.
5. **Verify the armor durability model** against WishGranter (§G) via `ballistics-verifier`.
6. **Reframe or drop the `allowedCategories` deferred item** (§F) — there is no upstream data for it.
