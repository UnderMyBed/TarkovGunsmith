import { useMemo, useState } from "react";
import {
  useModList,
  useWeaponList,
  useWeaponTree,
  itemAvailability,
  type BuildV6,
  type ModListItem,
  type PlayerProfile,
  type WeaponListItem,
} from "@tarkov/data";
import { weaponSpec, type WeaponSpec } from "@tarkov/ballistics";
import { adaptMod, adaptWeapon } from "../data-adapters/adapters.js";
import { useV1Migration } from "./useV1Migration.js";

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

  weaponOptions: WeaponListItem[];
  weaponId: string;
  handleWeaponChange: (weaponId: string) => void;
  showAllWeapons: boolean;
  setShowAllWeapons: (show: boolean) => void;
  selectedWeapon: WeaponListItem | undefined;

  tree: ReturnType<typeof useWeaponTree>;
  modList: ModListItem[];

  attachments: Record<string, string>;
  orphaned: string[];
  handleAttach: (path: string, itemId: string | null) => void;
  applyPreset: (next: Readonly<Record<string, string>>) => void;
  clearOrphaned: () => void;
  acceptOptimized: (attachments: Record<string, string>, orphaned: string[]) => void;
  modNamesById: Record<string, string>;
  availabilityById: Map<string, ReturnType<typeof itemAvailability>>;
  modSourcesById: Map<string, { hasCraft: boolean; hasBarter: boolean }>;

  spec: WeaponSpec | null;
  stockSpec: WeaponSpec | null;
  currentBuild: BuildV6;
  currentPrice: number | null;

  upstreamDriftInfo: { missingWeapon: boolean; missingModCount: number } | null;
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
  const weapons = useWeaponList();
  const mods = useModList();

  const [weaponId, setWeaponId] = useState<string>(initialWeaponId);
  const [attachments, setAttachments] = useState<Record<string, string>>(
    () => initialAttachments ?? {},
  );
  const [orphaned, setOrphaned] = useState<string[]>(() => initialOrphaned ?? []);
  const [showAllWeapons, setShowAllWeapons] = useState(false);

  const tree = useWeaponTree(weaponId);

  useV1Migration(initialWeaponId, initialModIds, tree.data?.slots, setAttachments, setOrphaned);

  const weaponAvailabilityById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof itemAvailability>>();
    for (const w of weapons.data ?? []) {
      map.set(w.id, itemAvailability(w, profile));
    }
    return map;
  }, [weapons.data, profile]);

  const weaponOptions = useMemo(() => {
    if (!weapons.data) return [];
    const sorted = [...weapons.data].sort((a, b) => a.name.localeCompare(b.name));
    if (showAllWeapons) return sorted;
    return sorted.filter((w) => weaponAvailabilityById.get(w.id)?.available === true);
  }, [weapons.data, weaponAvailabilityById, showAllWeapons]);

  const selectedWeapon = useMemo(
    () => weapons.data?.find((w) => w.id === weaponId),
    [weapons.data, weaponId],
  );

  const selectedMods = useMemo(
    () => (mods.data ? mods.data.filter((m) => Object.values(attachments).includes(m.id)) : []),
    [mods.data, attachments],
  );

  const modNamesById = useMemo(
    () => Object.fromEntries((mods.data ?? []).map((m) => [m.id, m.name])),
    [mods.data],
  );

  const availabilityById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof itemAvailability>>();
    for (const m of mods.data ?? []) {
      map.set(m.id, itemAvailability(m, profile));
    }
    return map;
  }, [mods.data, profile]);

  const modSourcesById = useMemo(() => {
    const map = new Map<string, { hasCraft: boolean; hasBarter: boolean }>();
    for (const m of mods.data ?? []) {
      map.set(m.id, {
        hasCraft: (m.craftsFor?.length ?? 0) > 0,
        hasBarter: (m.bartersFor?.length ?? 0) > 0,
      });
    }
    return map;
  }, [mods.data]);

  const spec = useMemo(() => {
    if (!selectedWeapon) return null;
    return weaponSpec(adaptWeapon(selectedWeapon), selectedMods.map(adaptMod));
  }, [selectedWeapon, selectedMods]);

  const stockSpec = useMemo(() => {
    if (!selectedWeapon) return null;
    return weaponSpec(adaptWeapon(selectedWeapon), []);
  }, [selectedWeapon]);

  const upstreamDriftInfo = useMemo(() => {
    // Only meaningful for loaded builds; fresh builds can't drift because they're built from current data.
    if (!initialWeaponId) return null;
    if (!weapons.data || !mods.data) return null;

    const missingWeapon = !weapons.data.some((w) => w.id === initialWeaponId);
    const knownModIds = new Set(mods.data.map((m) => m.id));
    const v1Missing = (initialModIds ?? []).filter((id) => !knownModIds.has(id));
    const v2Missing = Object.values(initialAttachments ?? {}).filter((id) => !knownModIds.has(id));
    const missingModCount = v1Missing.length + v2Missing.length;

    if (!missingWeapon && missingModCount === 0) return null;
    return { missingWeapon, missingModCount };
  }, [initialWeaponId, initialModIds, initialAttachments, weapons.data, mods.data]);

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

  const currentPrice = useMemo(() => {
    if (!mods.data) return null;
    let total = 0;
    for (const id of Object.values(attachments)) {
      const m = mods.data.find((x) => x.id === id);
      const fleaPrice =
        (m?.buyFor ?? []).find((b) => b.vendor.__typename === "FleaMarket")?.priceRUB ?? 0;
      total += fleaPrice;
    }
    return total;
  }, [mods.data, attachments]);

  function handleWeaponChange(newWeaponId: string) {
    setWeaponId(newWeaponId);
    setAttachments({});
    setOrphaned([]);
  }

  function handleAttach(path: string, itemId: string | null) {
    setAttachments((prev) => {
      const next = { ...prev };
      if (itemId === null) delete next[path];
      else next[path] = itemId;
      return next;
    });
  }

  function applyPreset(next: Readonly<Record<string, string>>) {
    setAttachments({ ...next });
    setOrphaned([]);
  }

  function clearOrphaned() {
    setOrphaned([]);
  }

  function acceptOptimized(nextAttachments: Record<string, string>, nextOrphaned: string[]) {
    setAttachments(nextAttachments);
    setOrphaned(nextOrphaned);
  }

  return {
    isLoading: weapons.isLoading || mods.isLoading,
    error: weapons.error ?? mods.error,

    weaponOptions,
    weaponId,
    handleWeaponChange,
    showAllWeapons,
    setShowAllWeapons,
    selectedWeapon,

    tree,
    modList: mods.data ?? [],

    attachments,
    orphaned,
    handleAttach,
    applyPreset,
    clearOrphaned,
    acceptOptimized,
    modNamesById,
    availabilityById,
    modSourcesById,

    spec,
    stockSpec,
    currentBuild,
    currentPrice,

    upstreamDriftInfo,
  };
}
