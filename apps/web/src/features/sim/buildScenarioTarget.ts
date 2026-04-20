import type { ScenarioTarget } from "@tarkov/ballistics";
import { createPmcTarget } from "@tarkov/ballistics";
import type { ArmorListItem } from "@tarkov/data";
import { adaptArmorForScenario } from "./adaptArmorForScenario.js";

export interface BuildScenarioTargetInput {
  readonly helmet: ArmorListItem | undefined;
  readonly bodyArmor: ArmorListItem | undefined;
}

/**
 * Compose a `ScenarioTarget` from the user's current loadout selections.
 * Starts from `createPmcTarget()` (fresh PMC HPs) and layers on adapted armor.
 *
 * @example
 *   const target = buildScenarioTarget({ helmet, bodyArmor });
 *   scenarioRun(ammo, target);
 */
export function buildScenarioTarget({
  helmet,
  bodyArmor,
}: BuildScenarioTargetInput): ScenarioTarget {
  const base = createPmcTarget();
  return {
    ...base,
    helmet: helmet ? adaptArmorForScenario(helmet) : undefined,
    bodyArmor: bodyArmor ? adaptArmorForScenario(bodyArmor) : undefined,
  };
}
