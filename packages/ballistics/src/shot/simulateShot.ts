import { armorDamage } from "../armor/armorDamage.js";
import { effectiveDamage } from "../armor/effectiveDamage.js";
import { penetrationChance } from "../armor/penetrationChance.js";
import type { BallisticAmmo, BallisticArmor, ShotResult } from "../types.js";

const PENETRATION_THRESHOLD = 0.5;

/**
 * Simulate a single shot deterministically. Penetration is decided by the
 * threshold rule: penetrationChance >= 0.5 → penetrate. For probabilistic
 * (Monte Carlo) callers, use `penetrationChance` directly with an external RNG.
 *
 * `distance` is currently unused in the math (penetration falloff is not yet
 * modeled); it is part of the signature so callers can record it and so
 * `simulateBurst` can present consistent results.
 *
 * @example
 *   simulateShot(m855, class4Fresh, 15);
 */
export function simulateShot(
  ammo: BallisticAmmo,
  armor: BallisticArmor,
  _distance: number,
): ShotResult {
  const chance = penetrationChance(
    ammo.penetrationPower,
    armor.armorClass,
    armor.currentDurability,
    armor.maxDurability,
  );
  const didPenetrate = chance >= PENETRATION_THRESHOLD;
  const dmg = effectiveDamage(
    ammo.damage,
    armor.armorClass,
    armor.currentDurability,
    armor.maxDurability,
    didPenetrate,
  );
  const armorDmg = armorDamage(
    ammo.armorDamagePercent,
    armor.materialDestructibility,
    didPenetrate,
  );
  const remainingDurability = Math.max(0, armor.currentDurability - armorDmg);
  return {
    didPenetrate,
    damage: dmg,
    armorDamage: armorDmg,
    remainingDurability,
    residualPenetration: ammo.penetrationPower,
  };
}
