import type { BallisticArmor, ShotResult } from "../types.js";

/** The seven canonical body-part zones we model in the scenario engine. */
export type Zone = "head" | "thorax" | "stomach" | "leftArm" | "rightArm" | "leftLeg" | "rightLeg";

/** The complete list of zones, in a stable iteration order. */
export const ZONES: readonly Zone[] = [
  "head",
  "thorax",
  "stomach",
  "leftArm",
  "rightArm",
  "leftLeg",
  "rightLeg",
] as const;

/** Per-body-part HP state. */
export interface BodyPart {
  /** Current HP. Clamped to 0 when damage exceeds it. */
  readonly hp: number;
  /** Maximum HP (never changes). */
  readonly max: number;
  /** True when hp reached 0 during the scenario. */
  readonly blacked: boolean;
}

/** Target: body-part state + optional helmet + optional body armor. */
export interface ScenarioTarget {
  readonly parts: Readonly<Record<Zone, BodyPart>>;
  /** Protects zones listed in its `zones` field. v1 only `head` is honoured. */
  readonly helmet?: BallisticArmor;
  /** Protects zones listed in its `zones` field. */
  readonly bodyArmor?: BallisticArmor;
}

/** One planned shot in a scenario's ordered plan. */
export interface PlannedShot {
  readonly zone: Zone;
  /** Metres. Passed through to `simulateShot` (currently unused by the math). */
  readonly distance: number;
}

export type ShotPlan = readonly PlannedShot[];

/** Result of one executed shot in the scenario. Extends `ShotResult`. */
export interface ScenarioShotResult extends ShotResult {
  readonly zone: Zone;
  /** Which armor piece absorbed the shot, or null for bare flesh. */
  readonly armorUsed: "helmet" | "bodyArmor" | null;
  /** Deep-cloned body state AFTER this shot resolved. */
  readonly bodyAfter: Record<Zone, BodyPart>;
  /** True iff this shot was the fatal one. */
  readonly killed: boolean;
}

/** Scenario-level result aggregating all executed shots. */
export interface ScenarioResult {
  readonly shots: readonly ScenarioShotResult[];
  readonly killed: boolean;
  /** Index into `shots` of the fatal shot, or null. */
  readonly killedAt: number | null;
}
