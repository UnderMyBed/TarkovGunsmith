import { simulateBurst } from "@tarkov/ballistics";
import type { BallisticAmmo, BallisticArmor } from "@tarkov/ballistics";

export type ChartClassification = "reliable" | "marginal" | "ineffective";

export interface ChartRow {
  readonly armor: BallisticArmor;
  readonly shotsToBreak: number;
  readonly classification: ChartClassification;
}

/**
 * Compute shots-to-break for a single ammo against a set of armors.
 * Input armor order is preserved (no sorting). Infinity indicates the
 * ammo never broke the armor within the simulation window (1000 shots).
 *
 * @example
 *   const rows = rankArmorsForAmmo(m855, allArmors, 30, 15);
 */
export function rankArmorsForAmmo(
  ammo: BallisticAmmo,
  armors: readonly BallisticArmor[],
  shotCap: number,
  distance: number,
): ChartRow[] {
  const SIM_WINDOW = 1000;
  return armors.map((armor) => {
    const results = simulateBurst(ammo, armor, SIM_WINDOW, distance);
    let breakIndex = -1;
    for (let i = 0; i < results.length; i++) {
      if (results[i]!.remainingDurability <= 0) {
        breakIndex = i;
        break;
      }
    }
    const shotsToBreak = breakIndex === -1 ? Number.POSITIVE_INFINITY : breakIndex + 1;
    const classification: ChartClassification =
      shotsToBreak <= shotCap
        ? "reliable"
        : shotsToBreak <= shotCap * 2
          ? "marginal"
          : "ineffective";
    return { armor, shotsToBreak, classification };
  });
}
