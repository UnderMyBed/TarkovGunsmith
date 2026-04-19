import { simulateShot } from "./simulateShot.js";
import type { BallisticAmmo, BallisticArmor, ShotResult } from "../types.js";

/**
 * Simulate `shots` rounds against the armor in sequence. Each shot sees the
 * armor's remaining durability from the previous shot. The caller's armor
 * object is never mutated.
 *
 * Returns an empty array for non-positive `shots`.
 *
 * @example
 *   simulateBurst(m995, class4Fresh, 5, 15);
 */
export function simulateBurst(
  ammo: BallisticAmmo,
  armor: BallisticArmor,
  shots: number,
  distance: number,
): ShotResult[] {
  if (shots <= 0) return [];
  const results: ShotResult[] = [];
  let currentDurability = armor.currentDurability;
  for (let i = 0; i < shots; i++) {
    const shot = simulateShot(ammo, { ...armor, currentDurability }, distance);
    results.push(shot);
    currentDurability = shot.remainingDurability;
  }
  return results;
}
