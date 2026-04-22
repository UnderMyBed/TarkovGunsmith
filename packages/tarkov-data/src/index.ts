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
export type { ModListItem, ModListBuyFor, ModListVendor } from "./queries/modList.js";

// Build schema
export {
  Build,
  BuildV1,
  BuildV2,
  BuildV3,
  BuildV4,
  PlayerProfile,
  DEFAULT_PROFILE,
  CURRENT_BUILD_VERSION,
} from "./build-schema.js";

// Build pair schema
export { BuildPair, BuildPairV1, CURRENT_PAIR_VERSION } from "./pair-schema.js";

// Hooks
export { useAmmoList } from "./hooks/useAmmoList.js";
export { useArmorList } from "./hooks/useArmorList.js";
export { useWeapon } from "./hooks/useWeapon.js";
export { useWeaponList } from "./hooks/useWeaponList.js";
export { useModList } from "./hooks/useModList.js";
export { useSaveBuild } from "./hooks/useSaveBuild.js";
export { useLoadBuild } from "./hooks/useLoadBuild.js";
export { useLoadPair } from "./hooks/useLoadPair.js";
export { useSavePair } from "./hooks/useSavePair.js";
export { useForkPair } from "./hooks/useForkPair.js";

// Builds API client
export {
  saveBuild,
  loadBuild,
  LoadBuildError,
  type LoadBuildErrorCode,
  type SaveBuildResponse,
} from "./buildsApi.js";

// Pairs API client
export {
  savePair,
  loadPair,
  forkPair,
  LoadPairError,
  type LoadPairErrorCode,
  type SavePairResponse,
} from "./pairsApi.js";

// Weapon tree (slot-based compatibility)
export { WEAPON_TREE_QUERY, fetchWeaponTree, normalizeSlots } from "./queries/weaponTree.js";
export type { WeaponTree, SlotNode, AllowedItem, SlotCategory } from "./queries/weaponTree.js";
export { useWeaponTree } from "./hooks/useWeaponTree.js";

// Build migrations
export { migrateV1ToV2, migrateV2ToV3, migrateV3ToV4 } from "./build-migrations.js";
export type { SlotNodeForMigration } from "./build-migrations.js";

// Progression gating
export { itemAvailability } from "./item-availability.js";
export type { ItemAvailability } from "./item-availability.js";
export { MARQUEE_QUEST_NORMALIZED_NAMES } from "./marquee-quests.js";
export { TRADERS_QUERY, fetchTraders, tradersSchema } from "./queries/traders.js";
export type { TraderListItem } from "./queries/traders.js";
export { TASKS_QUERY, fetchTasks, tasksSchema } from "./queries/tasks.js";
export type { TaskListItem } from "./queries/tasks.js";
export { useTraders } from "./hooks/useTraders.js";
export { useTasks } from "./hooks/useTasks.js";
export { useProfile } from "./hooks/useProfile.js";

// Presets
export { WEAPON_PRESETS, presetsForWeapon } from "./presets.js";
export type { WeaponPreset } from "./presets.js";

// Slot diff (Build comparison)
export { slotDiff } from "./slot-diff.js";
export type { SlotDiffStatus, SlotDiffInput, SlotDiffMap } from "./slot-diff.js";

// Stat delta (Build comparison)
export { statDelta } from "./stat-delta.js";
export type { StatDeltaRow, StatDeltaResult, StatDirection, StatKey } from "./stat-delta.js";

// TarkovTracker integration
export {
  fetchProgression,
  mapRawToProfile,
  buildIdMap,
  RawProgressionSchema,
  TokenInvalidError,
  RateLimitedError,
  NetworkError,
  ShapeMismatchError,
} from "./tarkovtracker/index.js";
export type { RawProgression, MapResult } from "./tarkovtracker/index.js";
