import type { AmmoListItem, ArmorListItem } from "@tarkov/data";
import type { BallisticAmmo, BallisticArmor } from "@tarkov/ballistics";

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
