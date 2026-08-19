import type { BallisticMod, BallisticWeapon } from "@tarkov/ballistics";
import type { ModListItem } from "./queries/modList.js";
import type { WeaponListItem } from "./queries/weaponList.js";

/**
 * Fallback base accuracy in MOA.
 *
 * Upstream exposes no base accuracy stat on a weapon — in EFT it is derived
 * from barrel, caliber and ammo, none of which the item document carries. This
 * constant is therefore fabricated, and the accuracy figures every surface
 * shows are only meaningful as *relative* comparisons between builds of the
 * same weapon. Recorded as such in docs/operations/data-api-audit.md §C.
 */
export const DEFAULT_BASE_ACCURACY = 3.5;

/**
 * Convert a `WeaponListItem` to the `@tarkov/ballistics` input shape.
 *
 * Reads the non-`default` recoil/ergonomics fields deliberately: upstream now
 * returns `defaultErgonomics` / `defaultRecoilVertical` / `defaultRecoilHorizontal`
 * as null, and the bare-receiver values are what the Builder wants anyway.
 *
 * @example
 *   const spec = weaponSpec(adaptWeapon(m4a1), mods.map(adaptMod));
 */
export function adaptWeapon(item: WeaponListItem): BallisticWeapon {
  return {
    id: item.id,
    name: item.name,
    baseErgonomics: item.properties.ergonomics,
    baseVerticalRecoil: item.properties.recoilVertical,
    baseHorizontalRecoil: item.properties.recoilHorizontal,
    baseWeight: item.weight,
    baseAccuracy: DEFAULT_BASE_ACCURACY,
  };
}

/**
 * Convert a `ModListItem` to the `@tarkov/ballistics` input shape.
 *
 * Pure passthrough by design. `BallisticMod.recoilModifier` and
 * `.accuracyModifier` carry upstream's own fractional unit, declared one file
 * away in `queries/modList.ts`, so there is nothing to convert here. This
 * function lives in `@tarkov/data` rather than in a consumer precisely because
 * a converting version of it once existed in three places and drifted: the
 * 100x recoil error in docs/operations/data-api-audit.md §B was one bug with
 * three copies. Scale for display at the point of render, never here.
 *
 * @example
 *   const mods = attachedItems.map(adaptMod);
 */
export function adaptMod(item: ModListItem): BallisticMod {
  return {
    id: item.id,
    name: item.name,
    ergonomicsDelta: item.properties.ergonomics,
    recoilModifier: item.properties.recoilModifier,
    weight: item.weight,
    accuracyModifier: item.properties.accuracyModifier,
  };
}
