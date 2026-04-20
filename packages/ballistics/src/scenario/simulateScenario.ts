import { simulateShot } from "../shot/simulateShot.js";
import type { BallisticAmmo, BallisticArmor, ShotResult } from "../types.js";
import type {
  PlannedShot,
  ScenarioResult,
  ScenarioShotResult,
  ScenarioTarget,
  Zone,
} from "./types.js";

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

  // Rolling mutable copies (never touch caller inputs).
  const parts: Record<Zone, { hp: number; max: number; blacked: boolean }> = {
    head: { ...target.parts.head },
    thorax: { ...target.parts.thorax },
    stomach: { ...target.parts.stomach },
    leftArm: { ...target.parts.leftArm },
    rightArm: { ...target.parts.rightArm },
    leftLeg: { ...target.parts.leftLeg },
    rightLeg: { ...target.parts.rightLeg },
  };
  let helmetDurability = target.helmet?.currentDurability ?? 0;
  let bodyArmorDurability = target.bodyArmor?.currentDurability ?? 0;

  const shots: ScenarioShotResult[] = [];
  let killed = false;
  let killedAt: number | null = null;

  for (let i = 0; i < plan.length; i++) {
    const planned = plan[i]!;
    const { zone, distance } = planned;

    const armorUsed = resolveArmorSource(zone, target);
    let shotResult: ShotResult;
    if (armorUsed === "helmet" && target.helmet) {
      const rolling: BallisticArmor = {
        ...target.helmet,
        currentDurability: helmetDurability,
      };
      shotResult = simulateShot(ammo, rolling, distance);
      helmetDurability = shotResult.remainingDurability;
    } else if (armorUsed === "bodyArmor" && target.bodyArmor) {
      const rolling: BallisticArmor = {
        ...target.bodyArmor,
        currentDurability: bodyArmorDurability,
      };
      shotResult = simulateShot(ammo, rolling, distance);
      bodyArmorDurability = shotResult.remainingDurability;
    } else {
      // Bare flesh: synthesise a full-pen, no-armor result.
      shotResult = {
        didPenetrate: true,
        damage: ammo.damage,
        armorDamage: 0,
        remainingDurability: 0,
        residualPenetration: ammo.penetrationPower,
      };
    }

    const part = parts[zone];
    part.hp = Math.max(0, part.hp - shotResult.damage);
    if (part.hp === 0) part.blacked = true;

    const fatal = (zone === "head" || zone === "thorax") && part.hp === 0;
    if (fatal) {
      killed = true;
      killedAt = i;
    }

    shots.push({
      ...shotResult,
      zone,
      armorUsed,
      bodyAfter: cloneParts(parts),
      killed: fatal,
    });

    if (fatal) break;
  }

  return { shots, killed, killedAt };
}

function cloneParts(
  parts: Record<Zone, { hp: number; max: number; blacked: boolean }>,
): Record<Zone, { hp: number; max: number; blacked: boolean }> {
  return {
    head: { ...parts.head },
    thorax: { ...parts.thorax },
    stomach: { ...parts.stomach },
    leftArm: { ...parts.leftArm },
    rightArm: { ...parts.rightArm },
    leftLeg: { ...parts.leftLeg },
    rightLeg: { ...parts.rightLeg },
  };
}

function resolveArmorSource(zone: Zone, target: ScenarioTarget): "helmet" | "bodyArmor" | null {
  if (zone === "head" && target.helmet && target.helmet.zones.includes(zone)) {
    return "helmet";
  }
  if (target.bodyArmor && target.bodyArmor.zones.includes(zone)) {
    return "bodyArmor";
  }
  return null;
}
