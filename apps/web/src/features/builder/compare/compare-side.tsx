import { useMemo, type ReactElement } from "react";
import {
  usePartCatalog,
  useWeaponList,
  useWeaponTree,
  attachedParts,
  itemAvailability,
  mountedAttachments,
  withAttachment,
  partsById,
  CURRENT_BUILD_VERSION,
  type AttachablePart,
  type BuildV6,
  type WeaponListItem,
  type PlayerProfile,
  type SlotDiffMap,
  type ItemAvailability,
  type WeaponTree,
} from "@tarkov/data";
import { weaponSpec, type WeaponSpec } from "@tarkov/ballistics";
import { Card, CardContent, SectionTitle, WeaponSilhouette } from "@tarkov/ui";
import { adaptMod, adaptWeapon } from "../../data-adapters/adapters.js";
import { SlotTree } from "../slot-tree.js";
import { OrphanedBanner } from "../orphaned-banner.js";
import { conflictReasonFor } from "../conflict-reason.js";

export interface CompareSideProps {
  /** Display label for this column (A = left, B = right). */
  label: "A" | "B";
  /** Section index used by the field-ledger SectionTitle (01, 02, …). */
  sectionIndex: number;
  /** Current build for this side, or null if the user hasn't picked a weapon yet. */
  build: BuildV6 | null;
  /** Profile used for availability gating (falls back to builder default when unset). */
  profile: PlayerProfile | undefined;
  /** Per-slot diff statuses from `slotDiff` — undefined/null skips diff highlighting. */
  diff: SlotDiffMap | null;
  /** Fires when the user edits weapon, attachments, or dismisses orphans. */
  onBuildChange: (build: BuildV6 | null) => void;
}

/**
 * One editable column of the Build comparison workspace. Renders a weapon
 * picker, the slot tree (with optional diff highlighting), and the orphan
 * banner for any mods that didn't migrate cleanly into the current weapon's
 * slots.
 *
 * The parent (CompareWorkspace) orchestrates both sides and composes stat
 * deltas via {@link computeSideSpec}.
 */
export function CompareSide({
  label,
  sectionIndex,
  build,
  profile,
  diff,
  onBuildChange,
}: CompareSideProps): ReactElement {
  const weapons = useWeaponList();
  const mods = usePartCatalog();
  const tree = useWeaponTree(build?.weaponId ?? "");
  const byId = useMemo(() => partsById(mods.data ?? []), [mods.data]);
  const attachments = build?.attachments;
  const getConflict = useMemo(
    () => (tree.data && attachments ? conflictReasonFor(tree.data, attachments, byId) : undefined),
    [tree.data, attachments, byId],
  );

  const weaponOptions = useMemo(() => {
    if (!weapons.data) return [];
    return [...weapons.data].sort((a, b) => a.name.localeCompare(b.name));
  }, [weapons.data]);

  const modNamesById = useMemo(
    () => Object.fromEntries((mods.data ?? []).map((m) => [m.id, m.name])),
    [mods.data],
  );

  const availabilityById = useMemo(() => {
    const map = new Map<string, ItemAvailability>();
    if (!mods.data || !profile) return map;
    for (const m of mods.data) {
      map.set(m.id, itemAvailability(m, profile));
    }
    return map;
  }, [mods.data, profile]);

  const getAvailability = (id: string): ItemAvailability | null => availabilityById.get(id) ?? null;

  function handleWeaponChange(newWeaponId: string) {
    if (newWeaponId === "") {
      onBuildChange(null);
      return;
    }
    const base: BuildV6 = build
      ? { ...build, weaponId: newWeaponId, attachments: {}, orphaned: [] }
      : {
          version: CURRENT_BUILD_VERSION,
          weaponId: newWeaponId,
          attachments: {},
          orphaned: [],
          createdAt: new Date().toISOString(),
        };
    onBuildChange(base);
  }

  // Replacing or clearing a part drops everything beneath it: those slots were the old part's.
  function handleAttach(slotPath: string, itemId: string | null) {
    if (!build) return;
    onBuildChange({ ...build, attachments: withAttachment(build.attachments, slotPath, itemId) });
  }

  function handleDismissOrphans() {
    if (!build) return;
    onBuildChange({ ...build, orphaned: [] });
  }

  const isLoading = weapons.isLoading || mods.isLoading;
  const loadError = weapons.error ?? mods.error;

  return (
    <Card variant="bracket" className="relative overflow-hidden">
      {build?.weaponId && (
        <div
          aria-hidden
          className="hidden md:block absolute inset-y-0 right-0 w-1/2 pointer-events-none"
        >
          <WeaponSilhouette
            itemId={build.weaponId}
            alt=""
            className="h-full w-full object-contain object-right"
          />
        </div>
      )}
      <div className="relative z-10">
        <CardContent className="flex flex-col gap-4 p-5">
          <SectionTitle
            index={sectionIndex}
            title={`Build ${label}`}
            meta={attachedMeta(build, tree.data, tree.error, byId)}
          />

          <div className="flex flex-col gap-2">
            <label
              htmlFor={`compare-weapon-${label}`}
              className="font-mono text-11 tracking-18 uppercase text-[var(--color-muted-foreground)]"
            >
              Weapon
            </label>
            <select
              id={`compare-weapon-${label}`}
              className="h-9 w-full rounded-[var(--radius)] border bg-[var(--color-input)] px-3 text-sm"
              value={build?.weaponId ?? ""}
              onChange={(e) => handleWeaponChange(e.target.value)}
              disabled={isLoading || weaponOptions.length === 0}
            >
              <option value="">{isLoading ? "Loading…" : "Select weapon…"}</option>
              {weaponOptions.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          {loadError && (
            <p className="text-sm text-[var(--color-destructive)]">
              Failed to load data: {loadError.message}
            </p>
          )}

          {!build && (
            <div className="py-6 text-center text-sm text-[var(--color-muted-foreground)]">
              No build selected.
            </div>
          )}

          {build && (
            <>
              <OrphanedBanner
                orphanedIds={build.orphaned}
                names={modNamesById}
                onDismiss={handleDismissOrphans}
              />
              {tree.isLoading && (
                <p className="font-mono text-11 tracking-18 uppercase text-[var(--color-muted-foreground)]">
                  Loading slot tree…
                </p>
              )}
              {tree.error && (
                <p className="text-sm text-[var(--color-destructive)]">
                  Couldn&apos;t load slot tree: {tree.error.message}
                </p>
              )}
              {tree.data && (
                <SlotTree
                  tree={tree.data}
                  attachments={build.attachments}
                  onAttach={handleAttach}
                  getAvailability={getAvailability}
                  getConflict={getConflict}
                  diff={diff ?? undefined}
                />
              )}
            </>
          )}
        </CardContent>
      </div>
    </Card>
  );
}

/**
 * The section-title count: parts on the weapon, never stale keys under a removed part. A
 * non-empty build needs its slot tree to know which keys those are.
 */
function attachedMeta(
  build: BuildV6 | null,
  tree: WeaponTree | undefined,
  treeError: Error | null,
  parts: ReadonlyMap<string, AttachablePart>,
): string {
  if (!build) return "empty";
  if (Object.keys(build.attachments).length === 0) return "0 attached";
  if (tree)
    return `${Object.keys(mountedAttachments(tree, build.attachments, parts)).length} attached`;
  return treeError ? "slot tree unavailable" : "loading";
}

/**
 * Pure helper: compute the {@link WeaponSpec} for one side of the compare
 * workspace. Shared with the parent so stat deltas don't have to reassemble
 * the adapted-weapon / adapted-mods wiring themselves.
 *
 * Returns `null` when the build is missing, the data lists or the build's
 * slot tree haven't loaded, or the referenced weapon isn't in the current
 * data set (upstream drift).
 */
export function computeSideSpec(
  build: BuildV6 | null,
  tree: WeaponTree | undefined,
  weapons: readonly WeaponListItem[] | undefined,
  parts: readonly AttachablePart[] | undefined,
): WeaponSpec | null {
  if (!build || !weapons || !parts || tree?.weaponId !== build.weaponId) return null;
  const weapon = weapons.find((w) => w.id === build.weaponId);
  if (!weapon) return null;
  // Only parts on the weapon, one entry per slot: a part fitted twice counts twice.
  const { entries } = attachedParts(tree, build.attachments, partsById(parts));
  return weaponSpec(
    adaptWeapon(weapon),
    entries.map((e) => adaptMod(e.part)),
  );
}
