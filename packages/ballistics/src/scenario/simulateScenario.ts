import type { BallisticAmmo } from "../types.js";
import type { PlannedShot, ScenarioResult, ScenarioTarget } from "./types.js";

/**
 * Simulate a multi-shot engagement deterministically. Walks `plan` in order,
 * tracking per-body-part HP and armor durability, and stops on head or thorax
 * HP = 0. Inputs are never mutated.
 *
 * @example
 *   const result = simulateScenario(m855, createPmcTarget(), [
 *     { zone: "thorax", distance: 15 },
 *     { zone: "thorax", distance: 15 },
 *   ]);
 */
export function simulateScenario(
  ammo: BallisticAmmo,
  target: ScenarioTarget,
  plan: readonly PlannedShot[],
): ScenarioResult {
  const alreadyDead = target.parts.head.hp <= 0 || target.parts.thorax.hp <= 0;
  if (alreadyDead) {
    return { shots: [], killed: true, killedAt: null };
  }
  if (plan.length === 0) {
    return { shots: [], killed: false, killedAt: null };
  }
  // Full engine lands in later tasks.
  return { shots: [], killed: false, killedAt: null };
}
