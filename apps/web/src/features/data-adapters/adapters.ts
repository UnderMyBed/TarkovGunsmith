import type { AmmoListItem, ArmorListItem, ModListItem, WeaponListItem } from "@tarkov/data";
import type {
  BallisticAmmo,
  BallisticArmor,
  BallisticMod,
  BallisticWeapon,
} from "@tarkov/ballistics";

const DEFAULT_BASE_ACCURACY = 3.5;

/**
 * Convert an `@tarkov/data` ammo item to the `@tarkov/ballistics` input shape.
 *
 * Field renames: `properties.armorDamage` → `armorDamagePercent`. The upstream
 * GraphQL field is named `armorDamage` (a percent 0–100), but the ballistics
 * package is explicit about the unit in the type name.
 */
export function adaptAmmo(item: AmmoListItem): BallisticAmmo {
  return {
    id: item.id,
    name: item.name,
    penetrationPower: item.properties.penetrationPower,
    damage: item.properties.damage,
    armorDamagePercent: item.properties.armorDamage,
    projectileCount: item.properties.projectileCount,
  };
}

/**
 * Convert an `@tarkov/data` armor item to the `@tarkov/ballistics` input shape.
 *
 * Defaults `currentDurability` to `maxDurability` — the calculator assumes
 * fresh armor unless the caller threads through current durability separately.
 */
export function adaptArmor(item: ArmorListItem): BallisticArmor {
  return {
    id: item.id,
    name: item.name,
    armorClass: item.properties.class,
    maxDurability: item.properties.durability,
    currentDurability: item.properties.durability,
    materialDestructibility: item.properties.material.destructibility,
    zones: item.properties.zones,
  };
}

/**
 * Convert an `@tarkov/data` weapon item to the `@tarkov/ballistics` input shape.
 *
 * Note: the upstream schema doesn't expose a base "accuracy" stat (it's
 * computed from barrel + caliber + ammo). Default to {@link DEFAULT_BASE_ACCURACY}
 * (typical AR baseline). Mod accuracyDelta values are still applied via
 * `weaponSpec`, so relative comparisons between builds remain accurate.
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
 * Convert an `@tarkov/data` mod item to the `@tarkov/ballistics` input shape.
 *
 * EFT's `recoilModifier` is already a percent (e.g. -8 for an 8% recoil
 * reduction), so it maps directly to `recoilModifierPercent`.
 */
export function adaptMod(item: ModListItem): BallisticMod {
  return {
    id: item.id,
    name: item.name,
    ergonomicsDelta: item.properties.ergonomics,
    recoilModifierPercent: item.properties.recoilModifier,
    weight: item.weight,
    accuracyDelta: item.properties.accuracyModifier,
  };
}
