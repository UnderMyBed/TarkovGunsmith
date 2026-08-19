/**
 * Input describing a single ammunition entry — only the fields the math
 * functions actually need. Adapt from `tarkov-api` data at the call site.
 */
export interface BallisticAmmo {
  /** Stable identifier (e.g. tarkov-api `id`). */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /** Penetration power (0–80 typical). */
  readonly penetrationPower: number;
  /** Base flesh damage per round. */
  readonly damage: number;
  /** Armor damage modifier as a percentage (0–100). */
  readonly armorDamagePercent: number;
  /** Number of projectiles per shot (1 for non-shotguns). */
  readonly projectileCount: number;
}

/**
 * Input describing a single armor entry.
 */
export interface BallisticArmor {
  readonly id: string;
  readonly name: string;
  /** Armor class 1–6 (Tarkov scale). */
  readonly armorClass: number;
  /** Maximum durability points when fresh. */
  readonly maxDurability: number;
  /** Current durability — caller passes the live value. */
  readonly currentDurability: number;
  /** Material modifier; affects armor damage taken. Default 1.0. */
  readonly materialDestructibility: number;
  /** Effective protection zones (chest, head, etc.). Informational; not used in math. */
  readonly zones: readonly string[];
}

/**
 * Result of a single shot.
 */
export interface ShotResult {
  /** Did the round penetrate the armor? */
  readonly didPenetrate: boolean;
  /** Damage dealt to the body (after armor mitigation if not penetrated). */
  readonly damage: number;
  /** Durability points removed from the armor. */
  readonly armorDamage: number;
  /** Armor durability after the shot. */
  readonly remainingDurability: number;
  /** Effective penetration power after armor reduction (informational). */
  readonly residualPenetration: number;
}

/**
 * Minimum weapon stats needed to aggregate with mods.
 */
export interface BallisticWeapon {
  readonly id: string;
  readonly name: string;
  readonly baseErgonomics: number;
  /** Vertical recoil base value. */
  readonly baseVerticalRecoil: number;
  /** Horizontal recoil base value. */
  readonly baseHorizontalRecoil: number;
  readonly baseWeight: number;
  /** Base accuracy (MOA-equivalent). Lower is better. */
  readonly baseAccuracy: number;
}

/**
 * Modification (sight, grip, suppressor, etc.). Ergonomics and weight are
 * additive; recoil and accuracy are fractional modifiers applied after sums.
 *
 * `recoilModifier` and `accuracyModifier` carry upstream's own unit rather than
 * a converted one. Converting at the adapter is what produced three divergent
 * copies of the same 100x error — see docs/operations/data-api-audit.md §B.
 * Both names deliberately match `ItemPropertiesWeaponMod` so a reader can diff
 * this shape against the Zod schema at
 * packages/tarkov-data/src/queries/modList.ts:12-13 field-for-field.
 */
export interface BallisticMod {
  readonly id: string;
  readonly name: string;
  /** Flat ergonomics delta (+/-). */
  readonly ergonomicsDelta: number;
  /**
   * Recoil modifier as a fraction, NOT a percent: -0.21 means -21% recoil.
   * Live upstream range is -0.35..0 (the AK-74 polymer stock reports -0.21 for
   * its in-game -21%). Multiply by 100 at the point of render, never here.
   */
  readonly recoilModifier: number;
  /** Weight in kg. */
  readonly weight: number;
  /**
   * Accuracy modifier as a fraction, live range -0.05..0.06. POSITIVE MEANS
   * BETTER: upstream reports +0.06 for the M700 AI AT AICS precision chassis
   * and -0.05 for the Mosin Bramit suppressor. Since {@link WeaponSpec.accuracy}
   * is MOA (lower is better), the sign inverts on application — see `weaponSpec`.
   */
  readonly accuracyModifier: number;
}

/**
 * Aggregated weapon + mods specification.
 */
export interface WeaponSpec {
  readonly weaponId: string;
  readonly modCount: number;
  readonly ergonomics: number;
  readonly verticalRecoil: number;
  readonly horizontalRecoil: number;
  readonly weight: number;
  readonly accuracy: number;
}
