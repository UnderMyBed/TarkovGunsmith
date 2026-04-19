/**
 * Body damage actually dealt after armor mitigation.
 *
 * On penetration, full damage. On deflection, damage is reduced by armor class
 * scaled by current durability percent. Clamped to 0 minimum.
 *
 * @example
 *   effectiveDamage(60, 4, 80, 80, true);  // 60 (penetrated)
 *   effectiveDamage(60, 4, 80, 80, false); // 36 (deflected, full durability)
 */
export function effectiveDamage(
  ammoDamage: number,
  armorClass: number,
  currentDurability: number,
  maxDurability: number,
  didPenetrate: boolean,
): number {
  if (didPenetrate) return ammoDamage;
  const durabilityPercent = Math.min(1, Math.max(0, currentDurability / maxDurability));
  const mitigation = 1 - armorClass * 0.1 * durabilityPercent;
  return Math.max(0, ammoDamage * mitigation);
}
