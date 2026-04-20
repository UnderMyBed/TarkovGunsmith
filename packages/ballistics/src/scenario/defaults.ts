import type { ScenarioTarget, Zone } from "./types.js";

/** Canonical PMC body-part max HP values (Tarkov). */
export const PMC_BODY_DEFAULTS: Readonly<Record<Zone, number>> = {
  head: 35,
  thorax: 85,
  stomach: 70,
  leftArm: 60,
  rightArm: 60,
  leftLeg: 65,
  rightLeg: 65,
};

/**
 * Build a fresh PMC target at full HP with no armor.
 *
 * @example
 *   const target = createPmcTarget();
 *   // target.parts.thorax.hp === 85
 */
export function createPmcTarget(): ScenarioTarget {
  const parts = {} as Record<Zone, { hp: number; max: number; blacked: boolean }>;
  for (const zone of Object.keys(PMC_BODY_DEFAULTS) as Zone[]) {
    const max = PMC_BODY_DEFAULTS[zone];
    parts[zone] = { hp: max, max, blacked: false };
  }
  return { parts };
}
