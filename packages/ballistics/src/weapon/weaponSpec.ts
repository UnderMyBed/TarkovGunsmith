import type { BallisticWeapon, BallisticMod, WeaponSpec } from "../types.js";

/**
 * Floor for the recoil multiplier, so a deep build can never report zero or
 * negative recoil.
 *
 * This is a guard, not a model. Measured against the live items document
 * (2026-08-19, 171 weapons) by taking the true recursive minimum per slot at
 * the resolution depth `weaponTree.ts` ships: the deepest reachable multiplier
 * is 0.062 (a fully-kitted Kalashnikov AKM), no weapon reaches <= 0, and the
 * value *saturates* — raising RECURSION_DEPTH to 4 or 5 does not push it lower.
 * So 0.01 is inert against the entire current mod pool at any depth and cannot
 * distort a build the app can actually produce today.
 *
 * A higher, "game-plausible" floor (~0.25) was deliberately rejected: upstream
 * carries no ground truth for fully-built weapon recoil, so that number would
 * be an unevidenced modelling claim that silently rewrites 7 live weapons —
 * the exact class of error docs/operations/data-api-audit.md exists to correct.
 */
const MIN_RECOIL_MULTIPLIER = 0.01;

/**
 * Aggregate weapon base stats with attached mods.
 *
 * Ergonomics and weight are additive. Recoil and accuracy are fractional
 * modifiers summed across mods and applied multiplicatively, in upstream's own
 * unit — `recoilModifier: -0.21` is -21%, so the multiplier is `1 + sum` with
 * no /100 anywhere. Getting that conversion wrong understated every recoil
 * reduction by 100x; see docs/operations/data-api-audit.md §B.
 *
 * Accuracy inverts on the way in. Upstream's `accuracyModifier` is positive for
 * better accuracy (M700 AI AT AICS chassis +0.06, Magpul PRS GEN3 +0.05) and
 * negative for worse (Mosin Bramit suppressor -0.05, AKM PBS-1 -0.03), while
 * `WeaponSpec.accuracy` is MOA where lower is better. Hence `1 - sum`: a +4%
 * accuracy mod must shrink the MOA figure, not grow it.
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
  const recoilMultiplier = Math.max(1 + recoilSum, MIN_RECOIL_MULTIPLIER);
  return {
    weaponId: weapon.id,
    modCount: mods.length,
    ergonomics: weapon.baseErgonomics + ergonomicsDelta,
    verticalRecoil: weapon.baseVerticalRecoil * recoilMultiplier,
    horizontalRecoil: weapon.baseHorizontalRecoil * recoilMultiplier,
    weight: weapon.baseWeight + weightDelta,
    accuracy: weapon.baseAccuracy * (1 - accuracySum),
  };
}
