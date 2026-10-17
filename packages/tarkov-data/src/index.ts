// Client
export { createTarkovClient, TarkovApiError } from "./client.js";
export {
  createOfferCollector,
  createOfferResolver,
  barterCostRUB,
  offerPriceIds,
  priceOffers,
} from "./queries/shared/buy-for.js";
export type {
  BuyForEntry,
  Vendor,
  BuyForTrader,
  BuyForTask,
  OfferCollector,
  OfferPreset,
  OfferResolver,
  OfferSources,
  BarterCost,
  BarterCostInput,
  BarterCostItem,
  UnpricedOffer,
} from "./queries/shared/buy-for.js";
export * from "./prices/index.js";
export type { TarkovJsonClient } from "./client.js";
export { mergeTranslations } from "./translations.js";
export type { TranslatedDocument } from "./translations.js";

// Provider
export { TarkovDataProvider, useTarkovClient, useBuilderData } from "./provider.js";
export type { TarkovDataProviderProps } from "./provider.js";

// Queries (fetchers + schemas + types)
export { ammoListSchema, fetchAmmoList } from "./queries/ammoList.js";
export type { AmmoListItem } from "./queries/ammoList.js";
export { armorListSchema, fetchArmorList } from "./queries/armorList.js";
export type { ArmorListItem } from "./queries/armorList.js";
export { weaponSchema, fetchWeapon } from "./queries/weapon.js";
export type { Weapon } from "./queries/weapon.js";
export { weaponListSchema, isBuildableWeapon } from "./queries/weaponList.js";
export { barterSchema } from "./queries/barters.js";
export type { Barter, BarterItem } from "./queries/barters.js";
export type { WeaponListItem } from "./queries/weaponList.js";
export { partsById, isModLikePart } from "./queries/parts.js";
export type { AttachablePart, AttachablePartType, ModLikePart } from "./queries/parts.js";
export { conflictsWith } from "./conflicts.js";
export type { Conflict, ConflictContext, ConflictFields } from "./conflicts.js";
export { resolveBuild } from "./build-core/resolve.js";
export { applyBuildAction, toBuildPayload } from "./build-core/reducer.js";
export type { BuildAction, BuildContext, BuildMeta, BuildState } from "./build-core/reducer.js";
export { loadSavedBuild } from "./build-core/load.js";
export type {
  BuildConflict,
  OrphanReason,
  OrphanedAttachment,
  PlacedPart,
  ResolvedBuild,
} from "./build-core/resolve.js";

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
export { ORPHANED_CAP } from "./build-schema.js";

// Build pair schema
export { BuildPair, BuildPairV1, CURRENT_PAIR_VERSION } from "./pair-schema.js";

// Hooks
export { useAmmoList } from "./hooks/useAmmoList.js";
export { useArmorList } from "./hooks/useArmorList.js";
export { useWeapon } from "./hooks/useWeapon.js";
export { useWeaponList } from "./hooks/useWeaponList.js";
export { useWeaponPresets } from "./hooks/useWeaponPresets.js";
export { usePartCatalog } from "./hooks/usePartCatalog.js";
export { useLivePrices } from "./hooks/useLivePrices.js";
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

// Builder snapshot (build-time game data)
export { BUILDER_SNAPSHOT_SCHEMA } from "./snapshot/types.js";
export type {
  BuilderPrices,
  BuilderSnapshot,
  SnapshotPart,
  SnapshotPreset,
  SnapshotSource,
  SnapshotWeapon,
} from "./snapshot/types.js";
export {
  buildBuilderSnapshot,
  fetchSnapshotDocuments,
  SnapshotDriftError,
} from "./snapshot/generate.js";
export type { SnapshotDocuments } from "./snapshot/generate.js";
export { SNAPSHOT_BUDGET, UPSTREAM_FLOORS } from "./snapshot/limits.js";
export {
  parseBuilderPrices,
  parseBuilderSnapshot,
  retrySnapshotLoad,
  SnapshotVersionError,
} from "./snapshot/load.js";
export {
  snapshotPart,
  snapshotPartsById,
  snapshotPartCatalog,
  snapshotPriceIds,
  snapshotSlotGraph,
  snapshotWeaponList,
  snapshotWeaponPresets,
  snapshotWeaponTree,
} from "./snapshot/views.js";
export type { PricedPreset } from "./snapshot/views.js";
export {
  createBuilderDataSource,
  memoryFetchedAtStore,
  staticBuilderDataSource,
} from "./snapshot/source.js";
export { requestPricesFromWorker } from "./snapshot/source.js";
export type {
  BuilderDataSource,
  BuilderDataSourceOptions,
  FetchedAtStore,
  PriceWorker,
} from "./snapshot/source.js";
export { buildPriceUnder, builderMode, priceGate, priceUnder, weaponPaths } from "./price-under.js";
export type {
  BuildPrice,
  BuildPriceInput,
  PresetContents,
  PricedPart,
  PriceGate,
  WeaponPath,
} from "./price-under.js";
export { useBuilderSnapshot } from "./hooks/useBuilderSnapshot.js";

// Weapon tree (slot-based compatibility)
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
export type { AvailabilityInput, ItemAvailability, TraderPayment } from "./item-availability.js";
export { MARQUEE_QUEST_NORMALIZED_NAMES } from "./marquee-quests.js";
export { isProfileTrader, tradersSchema } from "./queries/traders.js";
export type { TraderListItem } from "./queries/traders.js";
export { tasksSchema } from "./queries/tasks.js";
export type { TaskListItem } from "./queries/tasks.js";
export { useTraders } from "./hooks/useTraders.js";
export { useTasks } from "./hooks/useTasks.js";
export { useProfile } from "./hooks/useProfile.js";

// Presets
export { presetRecordSchema, selectWeaponPreset, selectWeaponPresets } from "./queries/presets.js";
export type {
  PresetFailure,
  PresetRecord,
  WeaponPreset,
  WeaponPresets,
} from "./queries/presets.js";
export { DEFAULT_MAX_NODES, placePreset } from "./preset-placement.js";
export type {
  PlacePresetInput,
  PresetPart,
  PresetPlacement,
  PresetPlacementFailure,
} from "./preset-placement.js";
export { presetAvailability, seedAttachments, seedPreset } from "./preset-seed.js";
export type { BuilderMode, PresetSeed } from "./preset-seed.js";

// Slot diff (Build comparison)
export { slotDiff } from "./slot-diff.js";
export type { SlotDiffStatus, SlotDiffInput, SlotDiffMap } from "./slot-diff.js";

// Ballistics input adapters (upstream item shape -> @tarkov/ballistics shape)
export { adaptMod, adaptWeapon, mountedMagazine } from "./ballistic-adapters.js";
export type { MountedMagazine } from "./ballistic-adapters.js";

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
