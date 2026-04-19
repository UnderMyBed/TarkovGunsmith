/**
 * Probability that a single shot penetrates the armor, in the range [0, 1].
 *
 * Formula derived from the EFT community wiki + WishGranter behavior. Effective
 * resistance scales linearly from 50% at 0 durability to 100% at full durability;
 * penetration probability ramps from 0 to 1 across a 15-point delta window.
 *
 * @example
 *   penetrationChance(40, 4, 80, 80); // 1.0 — overwhelms class 4 fresh
 *   penetrationChance(22.5, 4, 40, 80); // 0.5 — middle of the ramp
 *
 * @see https://escapefromtarkov.fandom.com/wiki/Ballistics
 */
export function penetrationChance(
  penetrationPower: number,
  armorClass: number,
  currentDurability: number,
  maxDurability: number,
): number {
  if (currentDurability <= 0) return 1.0;
  const durabilityPercent = Math.min(1, currentDurability / maxDurability);
  const effectiveResistance = armorClass * 10 * (0.5 + 0.5 * durabilityPercent);
  const delta = penetrationPower - effectiveResistance;
  if (delta >= 0) return 1.0;
  if (delta <= -15) return 0.0;
  return 1.0 + delta / 15;
}
