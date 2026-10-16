// Client
export { createTarkovClient, TarkovApiError } from "./client.js";
export { resolveBuyFor } from "./queries/shared/buy-for.js";
export type { BuyForEntry, Vendor, BuyForTrader, BuyForTask } from "./queries/shared/buy-for.js";
export type { TarkovJsonClient } from "./client.js";
export { mergeTranslations } from "./translations.js";
export type { TranslatedDocument } from "./translations.js";

// Provider
export { TarkovDataProvider, useTarkovClient } from "./provider.js";
export type { TarkovDataProviderProps } from "./provider.js";

// Queries (fetchers + schemas + types)
export { ammoListSchema, fetchAmmoList } from "./queries/ammoList.js";
export type { AmmoListItem } from "./queries/ammoList.js";
export { armorListSchema, fetchArmorList } from "./queries/armorList.js";
export type { ArmorListItem } from "./queries/armorList.js";
export { weaponSchema, fetchWeapon } from "./queries/weapon.js";
export type { Weapon } from "./queries/weapon.js";
export { weaponListSchema, fetchWeaponList } from "./queries/weaponList.js";
export type { WeaponListItem } from "./queries/weaponList.js";
export { selectPartCatalog, fetchPartCatalog, partsById, isModLikePart } from "./queries/parts.js";
export type {
  AttachablePart,
  AttachablePartType,
  ModLikePart,
  OfferResolver,
} from "./queries/parts.js";
export { attachedParts, fleaPriceRub } from "./attached-parts.js";
export type { AttachedParts, AttachedPartEntry } from "./attached-parts.js";

// Build schema
export {
  Build,
  BuildV1,
  BuildV2,
  BuildV3,
  BuildV4,
  BuildV5,
  BuildV6,
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
export { usePartCatalog } from "./hooks/usePartCatalog.js";
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
  SavePairError,
  type LoadPairErrorCode,
  type SavePairResponse,
} from "./pairsApi.js";

// Weapon tree (slot-based compatibility)
export { fetchWeaponTree } from "./queries/weaponTree.js";
export {
  buildSlotGraph,
  expandSlots,
  selectWeaponTree,
  slotAtPath,
  visibleSlots,
} from "./queries/slot-graph.js";
export type {
  WeaponTree,
  SlotNode,
  SlotDef,
  SlotGraph,
  SlotOwner,
  SlotCategory,
} from "./queries/slot-graph.js";
export { useWeaponTree } from "./hooks/useWeaponTree.js";

// Build migrations
export {
  migrateV1ToV2,
  migrateV2ToV3,
  migrateV3ToV4,
  migrateV4ToV5,
  migrateV5ToV6,
  upgradeLoadedBuild,
  legacyV1MigrationSlots,
} from "./build-migrations.js";
export type { SlotNodeForMigration } from "./build-migrations.js";

// Progression gating
export { itemAvailability } from "./item-availability.js";
export type { ItemAvailability } from "./item-availability.js";
export { MARQUEE_QUEST_NORMALIZED_NAMES } from "./marquee-quests.js";
export { fetchTraders, tradersSchema } from "./queries/traders.js";
export type { TraderListItem } from "./queries/traders.js";
export { fetchTasks, tasksSchema } from "./queries/tasks.js";
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

// Ballistics input adapters (upstream item shape -> @tarkov/ballistics shape)
export { adaptMod, adaptWeapon, DEFAULT_BASE_ACCURACY } from "./ballistic-adapters.js";

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
