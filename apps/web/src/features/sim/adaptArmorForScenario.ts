import type { BallisticArmor, Zone } from "@tarkov/ballistics";
import type { ArmorListItem } from "@tarkov/data";
import { adaptArmor } from "../data-adapters/adapters.js";

/**
 * Map upstream API zone strings (`"Chest"`, `"Stomach"`, `"Head"`) to our
 * canonical `Zone` enum values. Entries that don't appear here are dropped.
 */
export const API_ZONE_TO_SCENARIO: Readonly<Record<string, Zone>> = {
  Chest: "thorax",
  Stomach: "stomach",
  Head: "head",
  LeftArm: "leftArm",
  RightArm: "rightArm",
  LeftLeg: "leftLeg",
  RightLeg: "rightLeg",
};

/**
 * Wrap `adaptArmor` with scenario-specific zone translation. Unknown API
 * zone strings are dropped. Everything else (class, durability, material,
 * id, name) passes through unchanged.
 *
 * @example
 *   const target: ScenarioTarget = {
 *     ...createPmcTarget(),
 *     bodyArmor: adaptArmorForScenario(pacaItem),
 *   };
 */
export function adaptArmorForScenario(item: ArmorListItem): BallisticArmor {
  const base = adaptArmor(item);
  const mapped: Zone[] = [];
  for (const z of item.properties.zones) {
    const scenario = API_ZONE_TO_SCENARIO[z];
    if (scenario) mapped.push(scenario);
  }
  return { ...base, zones: mapped };
}
