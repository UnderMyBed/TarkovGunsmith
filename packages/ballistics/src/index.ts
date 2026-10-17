export type {
  BallisticAmmo,
  BallisticArmor,
  ShotResult,
  BallisticWeapon,
  BallisticMod,
  WeaponSpec,
} from "./types.js";
export { penetrationChance } from "./armor/penetrationChance.js";
export { armorDamage } from "./armor/armorDamage.js";
export { effectiveDamage } from "./armor/effectiveDamage.js";
export { simulateShot } from "./shot/simulateShot.js";
export { simulateBurst } from "./shot/simulateBurst.js";
export { armorEffectiveness } from "./armor/armorEffectiveness.js";
export { weaponSpec, CM_PER_MOA_AT_100M } from "./weapon/weaponSpec.js";
export { barrelDeviation } from "./weapon/barrelDeviation.js";
export type {
  Zone,
  BodyPart,
  ScenarioTarget,
  PlannedShot,
  ShotPlan,
  ScenarioShotResult,
  ScenarioResult,
} from "./scenario/types.js";
export { ZONES } from "./scenario/types.js";
export { PMC_BODY_DEFAULTS, createPmcTarget } from "./scenario/defaults.js";
export { simulateScenario } from "./scenario/simulateScenario.js";
