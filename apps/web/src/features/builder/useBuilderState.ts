import { useMemo, useState } from "react";
import {
  useBuilderSnapshot,
  useLivePrices,
  usePartCatalog,
  useWeaponList,
  useWeaponPresets,
  useWeaponTree,
  attachedParts,
  builderMode,
  mountedAttachments,
  withAttachment,
  itemAvailability,
  legacyV1MigrationSlots,
  partsById,
  priceGate,
  seedAttachments,
  type AttachablePart,
  type BuildPrice,
  type BuildV6,
  type PlayerProfile,
  type PriceGate,
  type PricedPreset,
  type WeaponListItem,
} from "@tarkov/data";
import { weaponSpec, type WeaponSpec } from "@tarkov/ballistics";
import { adaptMod, adaptWeapon } from "../data-adapters/adapters.js";
import { useV1Migration } from "./useV1Migration.js";
import { useSnapshotOrphans } from "./useSnapshotOrphans.js";
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
  initialWeaponId: string;
  initialModIds: string[] | undefined;
  initialAttachments: Record<string, string> | undefined;
  initialOrphaned: string[] | undefined;
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
  /** How many parts are on the weapon: filled slots the tree shows, not stale keys. */
  attachedCount: number;
  orphaned: string[];
  handleAttach: (path: string, itemId: string | null) => void;
  applyPreset: (next: Readonly<Record<string, string>>) => void;
  clearOrphaned: () => void;
  acceptOptimized: (attachments: Record<string, string>, orphaned: string[]) => void;
  modNamesById: Record<string, string>;
  /** Why a part cannot go at a slot path given the current build, or `null`. */
  getConflict: (path: string, itemId: string) => string | null;
  availabilityById: Map<string, ReturnType<typeof itemAvailability>>;

  spec: WeaponSpec | null;
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
  initialWeaponId,
  initialModIds,
  initialAttachments,
  initialOrphaned,
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

  const [weaponId, setWeaponId] = useState<string>(initialWeaponId);
  const [attachments, setAttachments] = useState<Record<string, string>>(
    () => initialAttachments ?? {},
  );
  const [orphaned, setOrphaned] = useState<string[]>(() => initialOrphaned ?? []);
  const [showAllWeapons, setShowAllWeapons] = useState(false);
  const mode = builderMode(showAllWeapons);
  const gate = priceGate(mode, profile);

  const tree = useWeaponTree(weaponId);

  // v1 links migrate against the frozen legacy tree, so their mods land where they always did.
  const legacyV1Slots = useMemo(
    () => (initialModIds && tree.data ? legacyV1MigrationSlots(tree.data) : undefined),
    [initialModIds, tree.data],
  );
  useV1Migration(initialWeaponId, initialModIds, legacyV1Slots, setAttachments, setOrphaned);
  // Parts a shared build names that the game data no longer holds become orphans. (v1 links
  // carry no attachments; their migration orphans whatever it cannot place.)
  useSnapshotOrphans(
    snapshot.data,
    initialAttachments,
    initialOrphaned,
    setAttachments,
    setOrphaned,
  );

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

  const byId = useMemo(() => partsById(catalog.data ?? []), [catalog.data]);

  // Only parts on the weapon count — never a stale key under a removed or replaced part. One
  // entry per slot: a part fitted twice counts twice, for stats and price alike. Until the
  // tree loads nothing is known to be on the weapon.
  const treeData = tree.data;
  const mounted = useMemo(
    () => (treeData ? mountedAttachments(treeData, attachments, byId) : {}),
    [treeData, attachments, byId],
  );
  const attached = useMemo(
    () => (treeData ? attachedParts(treeData, attachments, byId) : { entries: [], missing: [] }),
    [treeData, attachments, byId],
  );

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
      attached.entries.map((e) => adaptMod(e.part)),
    );
  }, [selectedWeapon, attached]);

  const stockSpec = useMemo(() => {
    if (!selectedWeapon) return null;
    return weaponSpec(adaptWeapon(selectedWeapon), []);
  }, [selectedWeapon]);

  // Only meaningful for loaded builds; a fresh build is made from the data on hand. Parts that
  // have gone are not counted here: `useSnapshotOrphans` moves them to `orphaned`, and the
  // orphan banner names them.
  const upstreamDriftInfo = useMemo(() => {
    if (!initialWeaponId || !weapons.data) return null;
    return weapons.data.some((w) => w.id === initialWeaponId)
      ? null
      : ({ missingWeapon: true } as const);
  }, [initialWeaponId, weapons.data]);

  const currentBuild = useMemo<BuildV6>(
    () => ({
      version: 6,
      weaponId,
      attachments,
      orphaned,
      createdAt: new Date().toISOString(),
      ...(buildName.trim().length > 0 ? { name: buildName.trim() } : {}),
      ...(buildDescription.trim().length > 0 ? { description: buildDescription.trim() } : {}),
      ...(embedProfileOnSave ? { profileSnapshot: profile } : {}),
    }),
    [weaponId, attachments, orphaned, buildName, buildDescription, embedProfileOnSave, profile],
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
    setWeaponId(newWeaponId);
    setAttachments(seedAttachments(presets.data?.[newWeaponId] ?? [], mode, profile));
    setOrphaned([]);
  }

  // Replacing or clearing a part drops everything beneath it: those slots were the old part's.
  function handleAttach(path: string, itemId: string | null) {
    setAttachments((prev) => withAttachment(prev, path, itemId));
  }

  // Orphans are the saved build's own data: only dismissing them clears the list.
  function applyPreset(next: Readonly<Record<string, string>>) {
    setAttachments({ ...next });
  }

  function clearOrphaned() {
    setOrphaned([]);
  }

  function acceptOptimized(nextAttachments: Record<string, string>, nextOrphaned: string[]) {
    setAttachments(nextAttachments);
    setOrphaned(nextOrphaned);
  }

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
    attachedCount: Object.keys(mounted).length,
    orphaned,
    handleAttach,
    applyPreset,
    clearOrphaned,
    acceptOptimized,
    modNamesById,
    getConflict,
    availabilityById,

    spec,
    stockSpec,
    currentBuild,
    buildPrice,
    prices: pricesStatus(livePrices),

    upstreamDriftInfo,
    dataAsOf: snapshot.data?.dataAsOf ?? null,
  };
}
