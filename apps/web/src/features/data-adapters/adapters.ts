import type { AmmoListItem, ArmorListItem } from "@tarkov/data";
import type { BallisticAmmo, BallisticArmor } from "@tarkov/ballistics";

/**
 * `adaptMod` / `adaptWeapon` live in `@tarkov/data` rather than here, beside
 * the Zod schemas that declare their units. They are re-exported so existing
 * route imports keep working — import from either, they are the same function.
 *
 * The move was not cosmetic: a converting copy of `adaptMod` existed here, in
 * `@tarkov/optimizer`, and in `@tarkov/og`, and all three carried the same
 * 100x recoil unit error (docs/operations/data-api-audit.md §B). One home next
 * to the schema is what stops that recurring.
 */
export { adaptMod, adaptWeapon, DEFAULT_BASE_ACCURACY } from "@tarkov/data";

/**
 * Convert an `@tarkov/data` ammo item to the `@tarkov/ballistics` input shape.
 *
 * Field renames: `properties.armorDamage` → `armorDamagePercent`. The upstream
 * field is named `armorDamage` and really is a percent (live range 0–95, and
 * M995 reports 52 against its in-game value), so the rename only makes the
 * unit explicit — unlike recoil, there is no conversion here either.
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
