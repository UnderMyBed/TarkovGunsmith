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
 * A weapon's own stats, as `weaponSpec` aggregates them with its mods. Every field mirrors an
 * upstream `ItemPropertiesWeapon` field; units are upstream's.
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
  /**
   * Upstream `properties.centerOfImpact`: the receiver's share of the build's dispersion, in
   * centimetres at 100 m. Live range 0..0.7; a barrel adds its own (see
   * {@link BallisticMod.centerOfImpact}).
   */
  readonly centerOfImpact: number;
  /** Upstream `properties.deviationCurve` (live 1..3.5): shapes the barrel deviation factor. */
  readonly deviationCurve: number;
  /**
   * Upstream top-level `velocity`: the receiver's muzzle velocity modifier as a PERCENT, not
   * a fraction (live -17.9..20; the AKM reports 1.8 for +1.8%).
   */
  readonly velocity: number;
  /** Upstream `properties.fireRate`, rounds per minute. No part modifies it upstream. */
  readonly fireRate: number;
  /** Upstream `properties.effectiveDistance`, metres. No part modifies it upstream. */
  readonly effectiveDistance: number;
  /** Upstream `properties.sightingRange`, metres (100 on every live weapon). */
  readonly sightingRange: number;
  /**
   * The weapon's default ammo (upstream `properties.defaultAmmo`), or `null` when upstream
   * publishes no ballistic record for it (the RShG-2's rocket). `initialSpeed` is m/s.
   */
  readonly defaultAmmo: { readonly name: string; readonly initialSpeed: number } | null;
}

/**
 * Modification (sight, grip, suppressor, etc.). Ergonomics and weight are
 * additive; recoil and accuracy are fractional modifiers applied after sums.
 *
 * `recoilModifier` and `accuracyModifier` carry upstream's own unit rather than
 * a converted one. Converting at the adapter is what produced three divergent
 * copies of the same 100x error — see docs/operations/data-api-audit.md §B.
 * Both names deliberately match the mod-like part properties so a reader can
 * diff this shape against the Zod schema at
 * packages/tarkov-data/src/queries/parts.ts field-for-field.
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
   * Accuracy modifier as a fraction, live range -0.05..0.1. POSITIVE MEANS
   * BETTER: upstream reports +0.06 for the M700 AI AT AICS precision chassis
   * and -0.05 for the Mosin Bramit suppressor. Since {@link WeaponSpec.accuracy}
   * is MOA (lower is better), the sign inverts on application — see `weaponSpec`.
   */
  readonly accuracyModifier: number;
  /** Barrel `properties.centerOfImpact` (live 0.011..0.75); 0 for every other part type. */
  readonly centerOfImpact: number;
  /** Barrel `properties.deviationMax` (live 7.5..33); `null` for every other part type. */
  readonly deviationMax: number | null;
  /**
   * Muzzle velocity modifier as a PERCENT (upstream top-level `velocity`): the AR-15 10.3"
   * barrel reports -11 for -11%. A different unit from `recoilModifier`.
   */
  readonly velocity: number;
  /** Scope / sight `properties.sightingRange` in metres; `null` for every other part type. */
  readonly sightingRange: number | null;
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
  /** Accuracy in MOA, lower is better: {@link baseMoa} × (1 − {@link accuracyModifier}). */
  readonly accuracy: number;
  /** MOA before accuracy modifiers — the figure upstream publishes as a preset's `moa`. */
  readonly baseMoa: number;
  /** Sum of the mods' `accuracyModifier`, a fraction (+0.16 means 16% tighter). */
  readonly accuracyModifier: number;
  /** Weapon plus mods' velocity modifiers, a PERCENT (-10.3 means -10.3%). */
  readonly velocityModifier: number;
  /** The default ammo's speed through this build in m/s, or `null` without a default ammo. */
  readonly muzzleVelocity: number | null;
  /** The ammo {@link muzzleVelocity} is for, or `null` with it. */
  readonly muzzleVelocityAmmo: string | null;
  /** Rounds per minute. */
  readonly fireRate: number;
  /** Metres. */
  readonly effectiveDistance: number;
  /** Metres: the longest of the weapon's own and any mounted sight's. */
  readonly sightingRange: number;
}
