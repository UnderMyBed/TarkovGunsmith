// Client
export { createTarkovClient } from "./client.js";
export type { GraphQLClient } from "./client.js";

// Provider
export { TarkovDataProvider, useTarkovClient } from "./provider.js";
export type { TarkovDataProviderProps } from "./provider.js";

// Queries (fetchers + schemas + types)
export { AMMO_LIST_QUERY, ammoListSchema, fetchAmmoList } from "./queries/ammoList.js";
export type { AmmoListItem } from "./queries/ammoList.js";
export { ARMOR_LIST_QUERY, armorListSchema, fetchArmorList } from "./queries/armorList.js";
export type { ArmorListItem } from "./queries/armorList.js";
export { WEAPON_QUERY, weaponSchema, fetchWeapon } from "./queries/weapon.js";
export type { Weapon } from "./queries/weapon.js";
export { WEAPON_LIST_QUERY, weaponListSchema, fetchWeaponList } from "./queries/weaponList.js";
export type { WeaponListItem } from "./queries/weaponList.js";
export { MOD_LIST_QUERY, modListSchema, fetchModList } from "./queries/modList.js";
export type { ModListItem } from "./queries/modList.js";

// Hooks
export { useAmmoList } from "./hooks/useAmmoList.js";
export { useArmorList } from "./hooks/useArmorList.js";
export { useWeapon } from "./hooks/useWeapon.js";
export { useWeaponList } from "./hooks/useWeaponList.js";
export { useModList } from "./hooks/useModList.js";
