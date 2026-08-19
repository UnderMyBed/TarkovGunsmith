/**
 * Durability points removed from armor by a single hit.
 *
 * Ported from the original WishGranter implementation, which is the ground
 * truth this project was rebuilt from:
 * `BackEnd/WishGranter/Statics/Ballistics.cs` in
 * [Xerxes-17/TarkovGunsmith](https://github.com/Xerxes-17/TarkovGunsmith)
 * (`DamageToArmorBlock` / `DamageToArmorPenetration` / `GetExpectedArmorDamage`).
 * That file describes the constants as "gleaned from reverse regression
 * analysis of a big data set of test results from in-game".
 *
 *     blocked    = max(pen × ad% × clamp(pen/class*10, 0.6, 1.1) × destr, 1)
 *     penetrated = max(pen × ad% × clamp(pen/class*10, 0.5, 0.9) × destr, 1)
 *     expected   = P(pen) × penetrated + (1 − P(pen)) × blocked
 *
 * The previous implementation here computed `(ad% × destr) / 100` and halved it
 * on a deflection. That was wrong by 35–58× and had the deflection sign
 * backwards; see docs/operations/data-api-audit.md §G for the measurement.
 *
 * ---
 *
 * ## The `pen / armor_class * 10` precedence is genuinely ambiguous
 *
 * Under C# (and TypeScript) precedence this parses as `(pen / class) * 10`.
 * Read that way the ratio is ≥ 1.67 for any round with `pen ≥ 1` against any
 * armor class ≤ 6, so **the clamp saturates at its ceiling on 95.0% of live
 * cells** and acts as a constant multiplier rather than a modulating term. Read
 * as `pen / (class * 10)` it would span 0.50–0.90 and actually modulate.
 *
 * The two readings agree on only 30% of live cells, and nothing in the original
 * source settles which the author intended. **This port takes the C# reading**
 * — not because it is more plausible as intent, but because it is what the
 * ground-truth implementation actually computes, and a faithful port owes that.
 * Verified: the C# reading is the only one that reproduces all four reference
 * pairs recorded in audit §G (44 / 104 / 22 / 161 shots).
 *
 * A consequence worth knowing before anyone "fixes" this: under the C# reading
 * the lower clamp rails (0.6 / 0.5) are **mathematically unreachable**. They
 * engage only when `pen < 0.06 × class ≤ 0.36`, and at that point the product
 * is at most `0.36 × 1.0 × 0.6 × 0.525 = 0.113`, which the min-1 floor always
 * raises to 1. Do not "simplify" them away on the assumption they are live —
 * they become live the moment the precedence reading changes.
 *
 * @see docs/operations/data-api-audit.md §G
 */

/** Live maximum armor damage as a fraction of the round's stated percentage. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * The ratio term shared by both branches. See the precedence note above.
 */
function damageRatio(penetrationPower: number, armorClass: number): number {
  return (penetrationPower / armorClass) * 10;
}

/**
 * Durability lost when the armor **stops** the round.
 *
 * Counter-intuitively this exceeds {@link armorDamagePenetrated} — the ceiling
 * is 1.1 against 0.9, so a blocked shot wears armor ~1.22× harder than one that
 * punches through.
 *
 * @example
 *   armorDamageBlocked(52, 0.1875, 53, 4); // 5.68425 — M995 into a 6B13
 */
export function armorDamageBlocked(
  armorDamagePercent: number,
  materialDestructibility: number,
  penetrationPower: number,
  armorClass: number,
): number {
  const raw =
    penetrationPower *
    (armorDamagePercent / 100) *
    clamp(damageRatio(penetrationPower, armorClass), 0.6, 1.1) *
    materialDestructibility;
  return Math.max(raw, 1);
}

/**
 * Durability lost when the round **penetrates** the armor.
 *
 * @example
 *   armorDamagePenetrated(52, 0.1875, 53, 4); // 4.65075 — M995 into a 6B13
 */
export function armorDamagePenetrated(
  armorDamagePercent: number,
  materialDestructibility: number,
  penetrationPower: number,
  armorClass: number,
): number {
  const raw =
    penetrationPower *
    (armorDamagePercent / 100) *
    clamp(damageRatio(penetrationPower, armorClass), 0.5, 0.9) *
    materialDestructibility;
  return Math.max(raw, 1);
}

/**
 * Expected durability loss from one hit, blending the blocked and penetrated
 * branches by the probability that the round penetrates.
 *
 * The original blends rather than branching on a threshold, which is why this
 * takes a probability instead of the `didPenetrate` boolean the previous
 * signature used. Callers that already have a thresholded verdict should pass
 * `0` or `1`.
 *
 * The min-1 floor is applied per branch (as in the original), so the blend of
 * two floored branches is itself never below 1.
 *
 * @example
 *   armorDamage(52, 0.1875, 53, 4, 1); // 4.65075 — certain penetration
 */
export function armorDamage(
  armorDamagePercent: number,
  materialDestructibility: number,
  penetrationPower: number,
  armorClass: number,
  penetrationProbability: number,
): number {
  const blocked = armorDamageBlocked(
    armorDamagePercent,
    materialDestructibility,
    penetrationPower,
    armorClass,
  );
  const penetrated = armorDamagePenetrated(
    armorDamagePercent,
    materialDestructibility,
    penetrationPower,
    armorClass,
  );
  return penetrationProbability * penetrated + (1 - penetrationProbability) * blocked;
}
