import type { ShotResult } from "@tarkov/ballistics";

export interface AdcSummary {
  /** Sum of ShotResult.damage across all shots (flesh damage dealt). */
  readonly totalDamage: number;
  /** Zero-based index of the first penetrating shot, or null if none. */
  readonly firstPenetrationAt: number | null;
  /** `remainingDurability` of the last shot, or `maxDurability` if empty. */
  readonly finalDurability: number;
}

/**
 * Aggregate a simulateBurst ShotResult[] into top-line ADC metrics.
 *
 * @example
 *   const results = simulateBurst(m855, paca, 5, 15);
 *   const { totalDamage, firstPenetrationAt } = adcSummary(results, paca.maxDurability);
 */
export function adcSummary(results: readonly ShotResult[], maxDurability: number): AdcSummary {
  let totalDamage = 0;
  let firstPenetrationAt: number | null = null;
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    totalDamage += r.damage;
    if (firstPenetrationAt === null && r.didPenetrate) {
      firstPenetrationAt = i;
    }
  }
  const finalDurability =
    results.length > 0 ? results[results.length - 1]!.remainingDurability : maxDurability;
  return { totalDamage, firstPenetrationAt, finalDurability };
}
