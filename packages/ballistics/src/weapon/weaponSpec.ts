import type { BallisticWeapon, BallisticMod, WeaponSpec } from "../types.js";

/**
 * Aggregate weapon base stats with attached mods.
 *
 * Ergonomics, weight, and accuracy are additive. Recoil uses multiplicative
 * percent: sum of `recoilModifierPercent` from all mods, applied as
 * `base * (1 + sum/100)`.
 *
 * @example
 *   const spec = weaponSpec(m4, [grip, stock, muzzle]);
 *   spec.ergonomics; // 53
 *   spec.verticalRecoil; // 41.44
 */
export function weaponSpec(weapon: BallisticWeapon, mods: readonly BallisticMod[]): WeaponSpec {
  const ergonomicsDelta = mods.reduce((sum, m) => sum + m.ergonomicsDelta, 0);
  const recoilSumPercent = mods.reduce((sum, m) => sum + m.recoilModifierPercent, 0);
  const weightDelta = mods.reduce((sum, m) => sum + m.weight, 0);
  const accuracyDelta = mods.reduce((sum, m) => sum + m.accuracyDelta, 0);
  const recoilMultiplier = 1 + recoilSumPercent / 100;
  return {
    weaponId: weapon.id,
    modCount: mods.length,
    ergonomics: weapon.baseErgonomics + ergonomicsDelta,
    verticalRecoil: weapon.baseVerticalRecoil * recoilMultiplier,
    horizontalRecoil: weapon.baseHorizontalRecoil * recoilMultiplier,
    weight: weapon.baseWeight + weightDelta,
    accuracy: weapon.baseAccuracy + accuracyDelta,
  };
}
