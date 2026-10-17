import { useMemo, useState } from "react";
import {
  useBuilderSnapshot,
  useLivePrices,
  usePartCatalog,
  useWeaponList,
  useWeaponPresets,
  useWeaponTree,
  applyBuildAction,
  builderMode,
  itemAvailability,
  partsById,
  priceGate,
  resolveBuild,
  seedAttachments,
  toBuildPayload,
  type AttachablePart,
  type BuildAction,
  type BuildContext,
  type BuildPrice,
  type BuildState,
  type BuildV6,
  type ResolvedBuild,
  type PlayerProfile,
  type PriceGate,
  type PricedPreset,
  type WeaponListItem,
} from "@tarkov/data";
import type { MountedMagazine } from "@tarkov/data";
import { weaponSpec, type WeaponSpec } from "@tarkov/ballistics";
import { adaptMod, adaptWeapon, mountedMagazine } from "../data-adapters/adapters.js";
import { conflictReasonFor } from "./conflict-reason.js";
import { priceBuild, pricesStatus, type PricesStatus } from "./build-price.js";

/**
 * A weapon the picker lists. `lockedBy` is set only on the current weapon when the profile
 * cannot obtain it and the picker is filtered to available weapons: it stays listed so the
 * picker still names what is on screen.
 */
export type WeaponOption = WeaponListItem & {
  readonly lockedBy: Extract<ReturnType<typeof itemAvailability>, { available: false }> | null;
};

const EMPTY_PARTS: AttachablePart[] = [];
const NO_PRESETS: PricedPreset[] = [];

export interface UseBuilderStateArgs {
  /**
   * A saved build to start from, already through `loadSavedBuild`: current version, every
   * attachment on the weapon, the rest in `orphaned`. `undefined` for a new build.
   */
  initialBuild: BuildV6 | undefined;
  /** Needed for availability gating (weapon list filter, per-mod LOCKED pills). */
  profile: PlayerProfile;
  /** Save metadata — folded into `currentBuild` alongside the weapon/mod state below. */
  buildName: string;
  buildDescription: string;
  embedProfileOnSave: boolean;
}

export interface UseBuilderStateResult {
  isLoading: boolean;
  error: Error | null;

  weaponOptions: WeaponOption[];
  weaponId: string;
  handleWeaponChange: (weaponId: string) => void;
  showAllWeapons: boolean;
  setShowAllWeapons: (show: boolean) => void;
  /** Whose gates price the build: the profile, or `null` in theorycraft (show all). */
  gate: PriceGate;
  selectedWeapon: WeaponListItem | undefined;
  /** The selected weapon's presets, priced, default first. */
  weaponPresets: readonly PricedPreset[];

  tree: ReturnType<typeof useWeaponTree>;
  /** Every slot-attachable part: mods, barrels, scopes, magazines, cylinder ammo. */
  parts: AttachablePart[];
  partsById: ReadonlyMap<string, AttachablePart>;

  attachments: Record<string, string>;
  /** The build resolved against its slot tree; `null` until the tree and parts load. */
  resolved: ResolvedBuild<AttachablePart> | null;
  /** How many parts are on the weapon: one per filled slot. */
  attachedCount: number;
  orphaned: string[];
  handleAttach: (path: string, itemId: string | null) => void;
  applyPreset: (next: Readonly<Record<string, string>>) => void;
  clearOrphaned: () => void;
  acceptOptimized: (attachments: Readonly<Record<string, string>>) => void;
  modNamesById: Record<string, string>;
  /** Why a part cannot go at a slot path given the current build, or `null`. */
  getConflict: (path: string, itemId: string) => string | null;
  availabilityById: Map<string, ReturnType<typeof itemAvailability>>;

  spec: WeaponSpec | null;
  /** The magazine in the weapon's magazine slot, or `null` with none fitted. */
  magazine: MountedMagazine | null;
  stockSpec: WeaponSpec | null;
  currentBuild: BuildV6;
  /** What the build costs under {@link gate}; `null` until the weapon and its parts load. */
  buildPrice: BuildPrice | null;
  prices: PricesStatus;

  /** Set when a loaded build's weapon is no longer in the game data. */
  upstreamDriftInfo: { missingWeapon: true } | null;
  /** When the game data was last updated upstream (ISO 8601), once the snapshot has loaded. */
  dataAsOf: string | null;
}

/**
 * The core "what is this build" domain state: weapon selection, attachments, orphan
 * tracking, and everything derived from them (availability, specs, price, drift detection).
 * Takes the viewer's profile and save metadata as inputs rather than owning them, since both
 * are genuinely shared with sibling hooks (`useShareBuild`, `useCompareHandoff`) that build
 * their own independent payloads from the same pieces.
 */
export function useBuilderState({
  initialBuild,
  profile,
  buildName,
  buildDescription,
  embedProfileOnSave,
}: UseBuilderStateArgs): UseBuilderStateResult {
  const snapshot = useBuilderSnapshot();
  const weapons = useWeaponList();
  const catalog = usePartCatalog();
  const presets = useWeaponPresets();
  const livePrices = useLivePrices();

  const [build, setBuild] = useState<BuildState>(() => ({
    weaponId: initialBuild?.weaponId ?? "",
    attachments: { ...initialBuild?.attachments },
    orphaned: [...(initialBuild?.orphaned ?? [])],
  }));
  const { weaponId, attachments, orphaned } = build;
  const [showAllWeapons, setShowAllWeapons] = useState(false);
  const mode = builderMode(showAllWeapons);
  const gate = priceGate(mode, profile);

  const tree = useWeaponTree(weaponId);
  const byId = useMemo(() => partsById(catalog.data ?? []), [catalog.data]);
  const treeData = tree.data;
  const ctx = useMemo<BuildContext | null>(
    () => (treeData && catalog.data ? { tree: treeData, parts: byId } : null),
    [treeData, catalog.data, byId],
  );
  const dispatch = (action: BuildAction) => setBuild((s) => applyBuildAction(s, action, ctx));

  const weaponAvailabilityById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof itemAvailability>>();
    for (const w of weapons.data ?? []) {
      map.set(w.id, itemAvailability(w, profile));
    }
    return map;
  }, [weapons.data, profile]);

  const weaponOptions = useMemo((): WeaponOption[] => {
    if (!weapons.data) return [];
    const sorted = [...weapons.data].sort((a, b) => a.name.localeCompare(b.name));
    if (showAllWeapons) return sorted.map((w) => ({ ...w, lockedBy: null }));
    const out: WeaponOption[] = [];
    for (const w of sorted) {
      const availability = weaponAvailabilityById.get(w.id);
      if (availability?.available === true) out.push({ ...w, lockedBy: null });
      else if (w.id === weaponId && availability !== undefined) {
        out.push({ ...w, lockedBy: availability });
      }
    }
    return out;
  }, [weapons.data, weaponAvailabilityById, showAllWeapons, weaponId]);

  const selectedWeapon = useMemo(
    () => weapons.data?.find((w) => w.id === weaponId),
    [weapons.data, weaponId],
  );

  // Only parts on the weapon count, one entry per slot: a part fitted twice counts twice, for
  // stats and price alike. Until the tree and parts load nothing is known to be on it.
  const resolved = useMemo(
    () => (ctx ? resolveBuild(ctx.tree, attachments, byId) : null),
    [ctx, attachments, byId],
  );
  const placed = resolved?.placed;

  const modNamesById = useMemo(
    () => Object.fromEntries((catalog.data ?? []).map((m) => [m.id, m.name])),
    [catalog.data],
  );

  const availabilityById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof itemAvailability>>();
    for (const m of catalog.data ?? []) {
      map.set(m.id, itemAvailability(m, profile));
    }
    return map;
  }, [catalog.data, profile]);

  const spec = useMemo(() => {
    if (!selectedWeapon) return null;
    return weaponSpec(
      adaptWeapon(selectedWeapon),
      (placed ?? []).map((e) => adaptMod(e.part)),
    );
  }, [selectedWeapon, placed]);

  const magazine = useMemo(() => mountedMagazine(placed ?? []), [placed]);

  const stockSpec = useMemo(() => {
    if (!selectedWeapon) return null;
    return weaponSpec(adaptWeapon(selectedWeapon), []);
  }, [selectedWeapon]);

  // Only meaningful for loaded builds; a fresh build is made from the data on hand. Parts that
  // have gone are not counted here: `loadSavedBuild` moved them to `orphaned`, and the orphan
  // banner names them.
  const initialWeaponId = initialBuild?.weaponId;
  const upstreamDriftInfo = useMemo(() => {
    if (!initialWeaponId || !weapons.data) return null;
    return weapons.data.some((w) => w.id === initialWeaponId)
      ? null
      : ({ missingWeapon: true } as const);
  }, [initialWeaponId, weapons.data]);

  const currentBuild = useMemo<BuildV6>(
    () =>
      toBuildPayload(build, {
        name: buildName,
        description: buildDescription,
        ...(embedProfileOnSave ? { profile } : {}),
      }),
    [build, buildName, buildDescription, embedProfileOnSave, profile],
  );

  const getConflict = useMemo(
    () => (tree.data ? conflictReasonFor(tree.data, attachments, byId) : () => null),
    [tree.data, attachments, byId],
  );

  const weaponPresets = presets.data?.[weaponId] ?? NO_PRESETS;
  const buildPrice = useMemo(
    () =>
      catalog.data
        ? priceBuild(gate, selectedWeapon, treeData, attachments, byId, weaponPresets)
        : null,
    [catalog.data, gate, selectedWeapon, treeData, attachments, byId, weaponPresets],
  );

  // A new build starts from the weapon's preset; loading a saved build never comes through
  // here, so a shared build is never re-seeded. Show-all is theorycraft until #241.
  function handleWeaponChange(newWeaponId: string) {
    const seed = seedAttachments(presets.data?.[newWeaponId] ?? [], mode, profile);
    dispatch({ type: "changeWeapon", weaponId: newWeaponId, seed });
  }

  // Replacing a part carries over what still fits on the new one; emptying drops its subtree.
  const handleAttach = (path: string, itemId: string | null) =>
    dispatch({ type: "attach", path, itemId });
  // Orphans are the saved build's own data: only dismissing them clears the list.
  const applyPreset = (next: Readonly<Record<string, string>>) =>
    dispatch({ type: "applyPreset", attachments: next });
  const clearOrphaned = () => dispatch({ type: "dismissOrphaned" });
  const acceptOptimized = (next: Readonly<Record<string, string>>) =>
    dispatch({ type: "acceptOptimized", attachments: next });

  return {
    isLoading: snapshot.isLoading || weapons.isLoading || catalog.isLoading || presets.isLoading,
    error: snapshot.error ?? weapons.error ?? catalog.error ?? presets.error,

    weaponOptions,
    weaponId,
    handleWeaponChange,
    showAllWeapons,
    setShowAllWeapons,
    gate,
    selectedWeapon,
    weaponPresets,

    tree,
    parts: catalog.data ?? EMPTY_PARTS,
    partsById: byId,

    attachments,
    resolved,
    attachedCount: placed?.length ?? 0,
    orphaned,
    handleAttach,
    applyPreset,
    clearOrphaned,
    acceptOptimized,
    modNamesById,
    getConflict,
    availabilityById,

    spec,
    magazine,
    stockSpec,
    currentBuild,
    buildPrice,
    prices: pricesStatus(livePrices),

    upstreamDriftInfo,
    dataAsOf: snapshot.data?.dataAsOf ?? null,
  };
}
