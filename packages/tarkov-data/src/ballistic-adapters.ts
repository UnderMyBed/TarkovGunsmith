import type { BallisticMod, BallisticWeapon } from "@tarkov/ballistics";
import type { AttachablePart } from "./queries/parts.js";
import type { WeaponListItem } from "./queries/weaponList.js";

/**
 * Convert a `WeaponListItem` to the `@tarkov/ballistics` input shape.
 *
 * Reads the non-`default` recoil/ergonomics fields deliberately: upstream now
 * returns `defaultErgonomics` / `defaultRecoilVertical` / `defaultRecoilHorizontal`
 * as null, and the bare-receiver values are what the Builder wants anyway. Every other field
 * passes through in upstream's unit: `centerOfImpact` in cm at 100 m, `velocity` a percent.
 *
 * @example
 *   const spec = weaponSpec(adaptWeapon(m4a1), mods.map(adaptMod));
 */
export function adaptWeapon(item: WeaponListItem): BallisticWeapon {
  const p = item.properties;
  return {
    id: item.id,
    name: item.name,
    baseErgonomics: p.ergonomics,
    baseVerticalRecoil: p.recoilVertical,
    baseHorizontalRecoil: p.recoilHorizontal,
    baseWeight: item.weight,
    centerOfImpact: p.centerOfImpact,
    deviationCurve: p.deviationCurve,
    velocity: item.velocity,
    fireRate: p.fireRate,
    effectiveDistance: p.effectiveDistance,
    sightingRange: p.sightingRange,
    defaultAmmo:
      item.defaultAmmo === null
        ? null
        : { name: item.defaultAmmo.shortName, initialSpeed: item.defaultAmmo.initialSpeed },
  };
}

/**
 * Convert an attachable part to the `@tarkov/ballistics` input shape.
 *
 * Pure passthrough by design. `BallisticMod.recoilModifier` and
 * `.accuracyModifier` carry upstream's own fractional unit, declared one file
 * away in `queries/parts.ts`, so there is nothing to convert here. This
 * function lives in `@tarkov/data` rather than in a consumer precisely because
 * a converting version of it once existed in three places and drifted: the
 * 100x recoil error in docs/operations/data-api-audit.md §B was one bug with
 * three copies. Scale for display at the point of render, never here.
 *
 * Ammo (a cartridge in a revolver `camora_*` slot) contributes its weight and
 * nothing else. That is a rule for the type, not a default for a missing
 * field: upstream's magazine-loaded presets exclude cartridge recoil (preset
 * 5a43a85186f7746c914b947a, pinned in preset-oracle.test.ts), and no live
 * preset loads a cylinder, so cylinder rounds follow the same rule.
 *
 * @example
 *   const mods = attachedParts(tree, attachments, byId).entries.map((e) => adaptMod(e.part));
 */
export function adaptMod(part: AttachablePart): BallisticMod {
  const p = part.properties;
  if (p.propertiesType === "ItemPropertiesAmmo") {
    return {
      id: part.id,
      name: part.name,
      ergonomicsDelta: 0,
      recoilModifier: 0,
      weight: part.weight,
      accuracyModifier: 0,
      centerOfImpact: 0,
      deviationMax: null,
      velocity: 0,
      sightingRange: null,
    };
  }
  return {
    id: part.id,
    name: part.name,
    ergonomicsDelta: p.ergonomics,
    recoilModifier: p.recoilModifier,
    weight: part.weight,
    accuracyModifier: p.accuracyModifier,
    // Only a barrel has a centerOfImpact and deviationMax upstream, and only a sight a
    // sightingRange: the other types carry no such field, so they add no dispersion and set
    // no range. A rule for the type, not a default for a missing field.
    centerOfImpact: p.propertiesType === "ItemPropertiesBarrel" ? p.centerOfImpact : 0,
    deviationMax: p.propertiesType === "ItemPropertiesBarrel" ? p.deviationMax : null,
    velocity: p.velocity,
    sightingRange: p.propertiesType === "ItemPropertiesScope" ? p.sightingRange : null,
  };
}

/** The magazine on a build, as upstream reports it. */
export interface MountedMagazine {
  readonly id: string;
  readonly name: string;
  /** Rounds. */
  readonly capacity: number;
  /** A signed fraction, as upstream reports it. */
  readonly loadModifier: number;
  /** A fraction. */
  readonly malfunctionChance: number;
}

/**
 * The magazine in the weapon's own `mod_magazine` slot, or `null` when that slot is empty or
 * the weapon has none (break-action shotguns, the MP-18, the RShG-2). Every live preset that
 * mounts a magazine mounts it there. Its figures are the part's own, not an aggregate.
 *
 * @example
 *   mountedMagazine(attachedParts(tree, attachments, byId).entries)?.capacity; // 30
 */
export function mountedMagazine(
  entries: readonly { readonly path: string; readonly part: AttachablePart }[],
): MountedMagazine | null {
  const entry = entries.find((e) => e.path === "mod_magazine");
  const p = entry?.part.properties;
  if (entry === undefined || p?.propertiesType !== "ItemPropertiesMagazine") return null;
  return {
    id: entry.part.id,
    name: entry.part.name,
    capacity: p.capacity,
    loadModifier: p.loadModifier,
    malfunctionChance: p.malfunctionChance,
  };
}
