/**
 * Durability points removed from the armor by a single hit.
 *
 * If the round penetrated, full damage is dealt. If it deflected, half damage.
 *
 * @example
 *   armorDamage(40, 0.5, true);  // 0.20
 *   armorDamage(40, 0.5, false); // 0.10
 *
 * @see https://escapefromtarkov.fandom.com/wiki/Ballistics
 */
export function armorDamage(
  armorDamagePercent: number,
  materialDestructibility: number,
  didPenetrate: boolean,
): number {
  const baseDamage = (armorDamagePercent * materialDestructibility) / 100;
  return didPenetrate ? baseDamage : baseDamage * 0.5;
}
