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
 * Modification (sight, grip, suppressor, etc.). All deltas are added to the
 * weapon's base stats. Multipliers (e.g. recoil reduction) apply after sums.
 */
export interface BallisticMod {
  readonly id: string;
  readonly name: string;
  /** Flat ergonomics delta (+/-). */
  readonly ergonomicsDelta: number;
  /** Recoil multiplier as a percentage (e.g. -8 means -8% recoil). */
  readonly recoilModifierPercent: number;
  /** Weight in kg. */
  readonly weight: number;
  /** Accuracy delta (negative is better). */
  readonly accuracyDelta: number;
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
