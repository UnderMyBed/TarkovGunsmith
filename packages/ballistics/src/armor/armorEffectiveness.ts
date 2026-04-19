import { simulateBurst } from "../shot/simulateBurst.js";
import type { BallisticAmmo, BallisticArmor } from "../types.js";

const DEFAULT_SHOT_CAP = 500;

/**
 * Compute a 2D matrix where `matrix[i][j]` is the number of shots of `ammos[i]`
 * needed to break (durability ≤ 0) `armors[j]`. Returns `Infinity` for cells
 * where the ammo cannot defeat the armor within `shotCap` shots.
 *
 * Used to power the AmmoVsArmor matrix UI. Default cap of 500 covers realistic
 * worst-case deflection-only rates without being unbounded.
 *
 * @example
 *   armorEffectiveness([m855, m995], [class4, class6]);
 */
export function armorEffectiveness(
  ammos: readonly BallisticAmmo[],
  armors: readonly BallisticArmor[],
  shotCap: number = DEFAULT_SHOT_CAP,
): number[][] {
  return ammos.map((ammo) =>
    armors.map((armor) => {
      const sequence = simulateBurst(ammo, armor, shotCap, 15);
      const breakIndex = sequence.findIndex((s) => s.remainingDurability <= 0);
      return breakIndex === -1 ? Number.POSITIVE_INFINITY : breakIndex + 1;
    }),
  );
}
