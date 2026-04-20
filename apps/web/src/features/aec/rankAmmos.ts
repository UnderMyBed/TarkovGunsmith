import { simulateBurst } from "@tarkov/ballistics";
import type { BallisticAmmo, BallisticArmor } from "@tarkov/ballistics";

export type AecClassification = "reliable" | "marginal" | "ineffective";

export interface AecRow {
  readonly ammo: BallisticAmmo;
  readonly shotsToBreak: number; // Infinity if cap exceeded
  readonly firstPenetrationAt: number | null;
  readonly totalDamageAtBreak: number;
  readonly classification: AecClassification;
}

/**
 * Rank a list of ammos by how efficiently each one breaks a single armor.
 * Sorts ascending by shotsToBreak; Infinity entries fall to the end.
 *
 * Classification:
 *   shotsToBreak ≤ shotCap       → "reliable"
 *   shotsToBreak ≤ shotCap * 2   → "marginal"
 *   otherwise                    → "ineffective"
 *
 * @example
 *   const rows = rankAmmos(ammos, class4Fresh, 30, 15);
 */
export function rankAmmos(
  ammos: readonly BallisticAmmo[],
  armor: BallisticArmor,
  shotCap: number,
  distance: number,
): AecRow[] {
  const rows: AecRow[] = ammos.map((ammo) => {
    // Simulate up to 1000 shots so we can find whether armor ever breaks.
    // Classification thresholds still use shotCap; this just bounds the search.
    const capPlusPadding = 1000;
    const results = simulateBurst(ammo, armor, capPlusPadding, distance);
    let firstPenetrationAt: number | null = null;
    let breakIndex = -1;
    let totalDamage = 0;
    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      totalDamage += r.damage;
      if (firstPenetrationAt === null && r.didPenetrate) firstPenetrationAt = i;
      if (breakIndex === -1 && r.remainingDurability <= 0) {
        breakIndex = i;
        break;
      }
    }
    const shotsToBreak = breakIndex === -1 ? Number.POSITIVE_INFINITY : breakIndex + 1;
    const totalDamageAtBreak = breakIndex === -1 ? 0 : totalDamage;
    const classification: AecClassification =
      shotsToBreak <= shotCap
        ? "reliable"
        : shotsToBreak <= shotCap * 2
          ? "marginal"
          : "ineffective";
    return { ammo, shotsToBreak, firstPenetrationAt, totalDamageAtBreak, classification };
  });
  rows.sort((a, b) => a.shotsToBreak - b.shotsToBreak);
  return rows;
}
