import type { BallisticWeapon, BallisticMod, WeaponSpec } from "../types.js";
import { barrelDeviation } from "./barrelDeviation.js";

/** Centimetres of dispersion at 100 m per minute of angle: `centerOfImpact` → MOA. */
export const CM_PER_MOA_AT_100M = 2.9089;

/**
 * Aggregate weapon base stats with attached mods.
 *
 * Ergonomics and weight are additive. Recoil is a fractional modifier summed across mods and
 * applied multiplicatively, in upstream's own unit — `recoilModifier: -0.21` is -21%, so the
 * multiplier is `1 + sum` with no /100 anywhere. Getting that conversion wrong understated
 * every recoil reduction by 100x; see docs/operations/data-api-audit.md §B. The multiplier is not
 * floored: `pnpm verify:upstream` runs the exact min-recoil optimizer over every live weapon and
 * fails if any valid build takes it to 0 or below.
 *
 * Accuracy is MOA, lower is better, in two factors:
 *
 * - `baseMoa` = (weapon + mods' `centerOfImpact`) × {@link barrelDeviation} at full durability
 *   × 100 / 2.9089. This is upstream's own preset `moa` formula (tarkov-data-manager
 *   `preset-data.mjs`), and `pnpm verify:upstream` checks it against every live preset.
 * - × (1 − Σ`accuracyModifier`). Upstream's `accuracyModifier` is positive for better
 *   accuracy (M700 AI AT AICS chassis +0.06) and negative for worse (Mosin Bramit suppressor
 *   -0.05), so a positive sum must shrink the MOA figure. **This factor has no oracle:**
 *   upstream's preset `moa` leaves accuracy modifiers out entirely, so nothing upstream can
 *   confirm it, and it has not been measured in game.
 *
 * Velocity modifiers are PERCENTS (the AR-15 10.3" barrel reports -11): the build's speed is
 * the default ammo's `initialSpeed` × (1 + (weapon + Σmods) / 100). No upstream figure checks
 * this either. The original TarkovGunsmith summed the same percents (weapon + every mod) but its
 * code that applies them to a cartridge is not in hand, so the rule is unverified. Fire rate and effective
 * distance are the weapon's own (no part modifies them upstream); sighting range is the
 * longest of the weapon's and any mounted sight's.
 *
 * @example
 *   const spec = weaponSpec(m4, [grip, stock, muzzle]);
 *   spec.ergonomics; // 69
 *   spec.verticalRecoil; // 54.74
 */
export function weaponSpec(weapon: BallisticWeapon, mods: readonly BallisticMod[]): WeaponSpec {
  const ergonomicsDelta = mods.reduce((sum, m) => sum + m.ergonomicsDelta, 0);
  const recoilSum = mods.reduce((sum, m) => sum + m.recoilModifier, 0);
  const weightDelta = mods.reduce((sum, m) => sum + m.weight, 0);
  const accuracySum = mods.reduce((sum, m) => sum + m.accuracyModifier, 0);
  const centerOfImpact = mods.reduce((sum, m) => sum + m.centerOfImpact, weapon.centerOfImpact);
  const velocityModifier = mods.reduce((sum, m) => sum + m.velocity, weapon.velocity);
  // Upstream takes the last part with a truthy `DeviationMax`, else 100; a build has one barrel.
  const deviationMax = mods.reduce<number>(
    (max, m) => (m.deviationMax !== null && m.deviationMax !== 0 ? m.deviationMax : max),
    100,
  );
  const sightingRange = mods.reduce(
    (range, m) => Math.max(range, m.sightingRange ?? 0),
    weapon.sightingRange,
  );
  const recoilMultiplier = 1 + recoilSum;
  const baseMoa =
    (centerOfImpact * barrelDeviation(weapon.deviationCurve, deviationMax) * 100) /
    CM_PER_MOA_AT_100M;
  const ammo = weapon.defaultAmmo;
  return {
    weaponId: weapon.id,
    modCount: mods.length,
    ergonomics: weapon.baseErgonomics + ergonomicsDelta,
    verticalRecoil: weapon.baseVerticalRecoil * recoilMultiplier,
    horizontalRecoil: weapon.baseHorizontalRecoil * recoilMultiplier,
    weight: weapon.baseWeight + weightDelta,
    accuracy: baseMoa * (1 - accuracySum),
    baseMoa,
    accuracyModifier: accuracySum,
    velocityModifier,
    muzzleVelocity: ammo === null ? null : ammo.initialSpeed * (1 + velocityModifier / 100),
    muzzleVelocityAmmo: ammo === null ? null : ammo.name,
    fireRate: weapon.fireRate,
    effectiveDistance: weapon.effectiveDistance,
    sightingRange,
  };
}
