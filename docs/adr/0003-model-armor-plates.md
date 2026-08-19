# ADR-0003: Model armor as plates plus soft panels, not as one monolithic layer

**Date:** 2026-08-19
**Status:** Accepted — implementation deliberately deferred, see "Sequencing"
**Supersedes:** N/A
**Superseded by:** N/A

## Context

`BallisticArmor` models a vest as a single layer with one `armorClass`, one `maxDurability` and
one `materialDestructibility`, read from upstream's top-level `properties.class`,
`properties.durability` and `properties.material`. Every armor calculation in the project —
`/matrix`, `/sim`, `/aec`, `/charts` — is built on that shape.

The 2026-08-19 data audit closed the arithmetic defects in that model: recoil and accuracy units
(§B, §C) and the armor durability formula, which was wrong by 35–58× (§G). The formula is now a
faithful port of the original WishGranter implementation and is pinned against it.

This ADR is about the remaining question the audit raised as follow-up #7 and deliberately did
not answer: **whether the numbers we feed that formula describe anything real.**

They do not.

### The top-level fields describe a layer that does not exist in the game

Measured against the live `json.tarkov.dev` items document (2026-08-19), across all 47 vests:

| Fact                                                         | Value                        |
| ------------------------------------------------------------ | ---------------------------- |
| Vests carrying `armorSlots`                                  | **47 / 47 (100%)**           |
| Vests where the chest path is a **plate**, not the top layer | **39 / 47 (83%)**            |
| Of those, top-level `class` ≠ front-plate `class`            | **30 / 39 (77%)**            |
| Of those, top-level destructibility ≠ front-plate's          | **39 / 39 (100%)**           |
| Top-level durability ÷ front-plate durability                | median **4.53×** (1.38–7.85) |

Concretely, the 6B13 assault armor:

|            | our model              | what a chest shot actually meets                |
| ---------- | ---------------------- | ----------------------------------------------- |
| class      | 4                      | **6** (front plate), backed by 2 (soft panel)   |
| durability | 203                    | **55** (front plate), backed by 34 (soft panel) |
| material   | Aramid (destr. 0.1875) | **Ceramic (destr. 0.6)**, backed by Aramid      |

The top-level `203` is not a layer. It is a rollup — the six soft panels alone sum to 108, and
the plates are separate items entirely, referenced by id from `armorSlots[].allowedPlates`.

### What that costs, after the formula is correct

Shots-to-break under the now-correct formula, our inputs vs the front plate's:

| Ammo | Armor      | our model (rollup) | front plate | overstated |
| ---- | ---------- | -----------------: | ----------: | ---------: |
| M995 | 6B13       |                 44 |           4 |      11.0× |
| M995 | Zabralo-Sh |                104 |           6 |      17.3× |
| M995 | Gzhel-K    |                 56 |           4 |      14.0× |
| M995 | Kirasa-N   |                 26 |           6 |       4.3× |
| M855 | Zabralo-Sh |                224 |          13 |      17.2× |

**A 4–17× overstatement survives the §G fix.** It is a different defect with the same
user-visible shape, and fixing the formula did not touch it. Anyone reading `/matrix` today is
told a 6B13 takes 44 rounds of M995 where the plate stops mattering after about 4.

The direction is consistent and adverse: we systematically make armor look far more durable than
it is, because we spread a rollup durability across a soft-armor destructibility while the real
stopping layer is a small, brittle, high-class plate.

## Decision

**Model armor as an ordered set of layers — plates in front of soft panels — rather than as one
monolithic layer.** Specifically:

1. `BallisticArmor` gains a layer list. Each layer carries its own `armorClass`, `maxDurability`,
   `currentDurability` and `materialDestructibility`, sourced from `armorSlots[]` (`class`,
   `durability`, `armorMaterial`) and, for plate slots, from the plate item resolved out of
   `allowedPlates`.
2. A shot resolves against layers in order. The original already implements this
   (`MultiLayerSimulation_EngineV2` in `Ballistics.cs`), including the reduction factor applied
   to penetration between layers and the note that plates take zero blunt damage on a block —
   so this is again a port, not an invention.
3. `armorSlots` selection becomes a user-facing choice, because it genuinely is one in game: a
   6B13's front slot accepts four different plates spanning several classes.
4. The top-level `class` / `durability` / `material` fields are **not** used for math once
   layers exist. They stay for display and sorting only, labelled as the rollup they are.

### Why not the alternatives

**Keep the monolithic model and accept the error.** Rejected. The whole point of the tool is
ammo-vs-armor comparison, and a systematic 4–17× bias in the single number the tool exists to
produce is not a rounding concern. It also silently mis-ranks ammo, because the bias is not
uniform — it varies with the gap between a vest's rollup material and its plate's.

**Keep the monolithic model but substitute the front plate's stats.** Rejected as a half-measure
that trades one wrong single-layer answer for another. It ignores the soft panel entirely, drops
the between-layer penetration reduction, and would mislead in the opposite direction for the
eight soft-only vests. It is also barely cheaper than doing it properly, since it needs the same
`allowedPlates` resolution.

**Wait for in-game measurements first.** Rejected as a sequencing error. Measurements
(audit follow-up #6) discriminate between candidate _formulas_; they are not needed to establish
that we are feeding the formula the wrong _item_. That is settled by the document itself.

## Consequences

**Good**

- The numbers start describing the game. This is the largest remaining correctness gap in the
  project after §G.
- Plate selection is a genuinely useful feature, not just a correctness fix — "which plate should
  I run" is a question players actually ask, and no monolithic model can answer it.
- We already have the ground truth. `MultiLayerSimulation_EngineV2` is a working reference, and
  `armorDamage.ts` is already the shape a layered engine needs.
- `bluntThroughput` is already in the document and unused; the layered model is where it belongs.

**Bad / accepted**

- This is the largest change to `packages/ballistics` since it was written. `BallisticArmor` is a
  published domain type consumed by `/matrix`, `/sim`, `/aec`, `/charts` and the optimizer.
- `/matrix` becomes a harder question to render. "Shots to break" is no longer one number — it is
  per layer, and which layer the reader cares about depends on what they are asking.
- Armor fixtures need rebuilding again, this time as layer sets.
- More upstream surface to track: a plate rebalance patch now moves our numbers, which is
  exactly what the `Upstream contract` workflow exists to catch.

**Neutral**

- The §G durability formula port is unaffected and stays correct. This ADR changes what the
  formula is applied _to_, not the formula.

## Sequencing

The decision is accepted; the implementation is **not** scheduled by this ADR. It is a milestone,
not a PR, and it should be scoped as one — a tracker epic, and a decision about the `/matrix`
presentation question before any code is written.

**In the interim, `/matrix` carries a visible caveat** stating that armor is modelled as a single
layer and that plate-equipped vests will therefore read as more durable than they are. Shipping a
known 4–17× bias without saying so is not acceptable, and the caveat is cheap where the fix is
not.

## References

- [`docs/operations/data-api-audit.md`](../operations/data-api-audit.md) §G and follow-up #7
- `BackEnd/WishGranter/Statics/Ballistics.cs` in
  [Xerxes-17/TarkovGunsmith](https://github.com/Xerxes-17/TarkovGunsmith) —
  `MultiLayerSimulation_EngineV2`, `CalculateReductionFactor`
- [ADR-0002](./0002-json-api-migration.md) — the JSON API is what exposes `armorSlots` and
  `bluntThroughput` in the first place
