import { useMemo, type ReactElement } from "react";
import {
  usePartCatalog,
  useWeaponList,
  useWeaponPresets,
  useWeaponTree,
  applyBuildAction,
  itemAvailability,
  partsById,
  resolveBuild,
  seedAttachments,
  toBuildPayload,
  DEFAULT_PROFILE,
  type AttachablePart,
  type BuildAction,
  type BuildContext,
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
import { SlotInspector } from "../slot-inspector.js";
import { useSlotSelection } from "../slot-selection.js";
import { SlotTree } from "../slot-tree.js";
import { OrphanedBanner } from "../orphaned-banner.js";
import { conflictReasonFor, fittedConflictReasonFor } from "../conflict-reason.js";

const NO_ATTACHMENTS: Readonly<Record<string, string>> = {};

export interface CompareSideProps {
  /** Display label for this column (A = left, B = right). */
  label: "A" | "B";
  /** Section index used by the field-ledger SectionTitle (01, 02, …). */
  sectionIndex: number;
  /** Current build for this side, or null if the user hasn't picked a weapon yet. */
  build: BuildV6 | null;
  /**
   * The side's own profile: with one the side is in progression on it (pills, seed, price);
   * without one, theorycraft.
   */
  profile: PlayerProfile | undefined;
  /** Per-slot diff statuses from `slotDiff` — undefined/null skips diff highlighting. */
  diff: SlotDiffMap | null;
  /** Fires when the user edits weapon, attachments, or dismisses orphans. */
  onBuildChange: (build: BuildV6 | null) => void;
  /**
   * Fires after the {@link onBuildChange} for a newly picked weapon, which starts from a
   * seed: the owner of the side's state redoes a seed made before live prices arrived.
   */
  onWeaponSeeded: (weaponId: string) => void;
  /** Whether live prices are in: only then does the side's inspector offer sorting by price. */
  pricesReady: boolean;
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
  onWeaponSeeded,
  pricesReady,
}: CompareSideProps): ReactElement {
  const weapons = useWeaponList();
  const mods = usePartCatalog();
  const presets = useWeaponPresets();
  const tree = useWeaponTree(build?.weaponId ?? "");
  const byId = useMemo(() => partsById(mods.data ?? []), [mods.data]);
  const attachments = build?.attachments;
  const ctx = useMemo<BuildContext | null>(
    () => (tree.data && mods.data ? { tree: tree.data, parts: byId } : null),
    [tree.data, mods.data, byId],
  );
  const getConflict = useMemo(
    () => (tree.data && attachments ? conflictReasonFor(tree.data, attachments, byId) : undefined),
    [tree.data, attachments, byId],
  );

  const resolved = useMemo(
    () =>
      ctx && build && ctx.tree.weaponId === build.weaponId
        ? resolveBuild(ctx.tree, build.attachments, byId)
        : null,
    [ctx, build, byId],
  );
  const getFittedConflict = useMemo(
    () => fittedConflictReasonFor(resolved?.conflicts ?? [], (id) => byId.get(id)?.shortName ?? id),
    [resolved, byId],
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

  const selection = useSlotSelection(tree.data, attachments ?? NO_ATTACHMENTS);
  const selectedSlot = selection.selected?.slot ?? null;

  /** The side after `action`, through the same reducer the Builder uses; metadata kept. */
  function apply(current: BuildV6, action: BuildAction): BuildV6 {
    const next = applyBuildAction(current, action, ctx);
    return {
      ...current,
      weaponId: next.weaponId,
      attachments: next.attachments,
      orphaned: next.orphaned,
    };
  }

  function handleWeaponChange(newWeaponId: string) {
    if (newWeaponId === "") {
      onBuildChange(null);
      return;
    }
    // A loaded pair never comes through here.
    const seed = sideSeed(presets.data?.[newWeaponId] ?? [], profile);
    const action: BuildAction = { type: "changeWeapon", weaponId: newWeaponId, seed };
    onBuildChange(
      build
        ? apply(build, action)
        : toBuildPayload(
            applyBuildAction({ weaponId: "", attachments: {}, orphaned: [] }, action, null),
          ),
    );
    onWeaponSeeded(newWeaponId);
  }

  // Replacing a part carries over what still fits on the new one; emptying drops its subtree.
  function handleAttach(slotPath: string, itemId: string | null) {
    if (!build) return;
    onBuildChange(apply(build, { type: "attach", path: slotPath, itemId }));
  }

  function handleDismissOrphans() {
    if (!build) return;
    onBuildChange(apply(build, { type: "dismissOrphaned" }));
  }

  const isLoading = weapons.isLoading || mods.isLoading || presets.isLoading;
  const loadError = weapons.error ?? mods.error ?? presets.error;

  return (
    <Card className="relative overflow-hidden">
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
              className="text-11 text-[var(--color-muted-foreground)]"
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
                <p className="text-11 text-[var(--color-muted-foreground)]">Loading slot tree…</p>
              )}
              {tree.error && (
                <p className="text-sm text-[var(--color-destructive)]">
                  Couldn&apos;t load slot tree: {tree.error.message}
                </p>
              )}
              {tree.data && (
                <div className="-mx-5 border-y border-[var(--color-border)] py-1.5">
                  <SlotTree
                    selection={selection}
                    attachments={build.attachments}
                    getAvailability={getAvailability}
                    getFittedConflict={getFittedConflict}
                    diff={diff ?? undefined}
                    side={label === "A" ? "left" : "right"}
                    label={`Build ${label} slots`}
                  />
                </div>
              )}
              {tree.data && selectedSlot && (
                <SlotInspector
                  weaponId={build.weaponId}
                  id={selection.inspectorId}
                  slot={selectedSlot}
                  fittedId={build.attachments[selectedSlot.path] ?? null}
                  parts={byId}
                  onAttach={handleAttach}
                  getAvailability={getAvailability}
                  getConflict={getConflict}
                  mode={profile ? "progression" : "theorycraft"}
                  pricesReady={pricesReady}
                  onEscape={selection.focusTreeRow}
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
 * The section-title meta: parts on the weapon, never stale keys under a removed part, then
 * "incomplete" when a required slot is empty and "conflict" when two fitted parts clash. Both
 * need the build's slot tree.
 */
function attachedMeta(
  build: BuildV6 | null,
  tree: WeaponTree | undefined,
  treeError: Error | null,
  parts: ReadonlyMap<string, AttachablePart>,
): string {
  if (!build) return "empty";
  if (tree?.weaponId === build.weaponId) {
    const r = resolveBuild(tree, build.attachments, parts);
    return [
      `${r.placed.length} attached`,
      ...(r.missingRequired.length > 0 ? ["incomplete"] : []),
      ...(r.conflicts.length > 0 ? ["conflict"] : []),
    ].join(" · ");
  }
  if (Object.keys(build.attachments).length === 0) return "0 attached";
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
  const { placed } = resolveBuild(tree, build.attachments, partsById(parts));
  return weaponSpec(
    adaptWeapon(weapon),
    placed.map((e) => adaptMod(e.part)),
  );
}

/**
 * `build` with `weaponId` seeded again under the side's profile, through the same reducer as a
 * weapon pick; the side's metadata is kept. Redoes a seed once live prices arrive.
 */
export function reseedSide(
  build: BuildV6,
  weaponId: string,
  presets: Parameters<typeof seedAttachments>[0],
  profile: PlayerProfile | undefined,
): BuildV6 {
  const seed = sideSeed(presets, profile);
  const next = applyBuildAction(build, { type: "changeWeapon", weaponId, seed }, null);
  return {
    ...build,
    weaponId: next.weaponId,
    attachments: next.attachments,
    orphaned: next.orphaned,
  };
}

/**
 * The attachments a new weapon on a Compare side starts with, under the side's own mode:
 * progression on the profile the side carries, theorycraft (the default preset, no profile
 * read) without one.
 */
export function sideSeed(
  presets: Parameters<typeof seedAttachments>[0],
  profile: PlayerProfile | undefined,
): Record<string, string> {
  return profile === undefined
    ? seedAttachments(presets, "theorycraft", DEFAULT_PROFILE)
    : seedAttachments(presets, "progression", profile);
}
