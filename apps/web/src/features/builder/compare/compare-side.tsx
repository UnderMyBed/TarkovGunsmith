import { useMemo, type ReactElement } from "react";
import {
  useModList,
  useWeaponList,
  useWeaponTree,
  itemAvailability,
  CURRENT_BUILD_VERSION,
  type BuildV4,
  type ModListItem,
  type WeaponListItem,
  type PlayerProfile,
  type SlotDiffMap,
  type ItemAvailability,
} from "@tarkov/data";
import { weaponSpec, type WeaponSpec } from "@tarkov/ballistics";
import { Card, CardContent, SectionTitle } from "@tarkov/ui";
import { adaptMod, adaptWeapon } from "../../data-adapters/adapters.js";
import { SlotTree } from "../slot-tree.js";
import { OrphanedBanner } from "../orphaned-banner.js";

export interface CompareSideProps {
  /** Display label for this column (A = left, B = right). */
  label: "A" | "B";
  /** Section index used by the field-ledger SectionTitle (01, 02, …). */
  sectionIndex: number;
  /** Current build for this side, or null if the user hasn't picked a weapon yet. */
  build: BuildV4 | null;
  /** Profile used for availability gating (falls back to builder default when unset). */
  profile: PlayerProfile | undefined;
  /** Per-slot diff statuses from `slotDiff` — undefined/null skips diff highlighting. */
  diff: SlotDiffMap | null;
  /** Fires when the user edits weapon, attachments, or dismisses orphans. */
  onBuildChange: (build: BuildV4 | null) => void;
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
  const mods = useModList();
  const tree = useWeaponTree(build?.weaponId ?? "");

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
    const base: BuildV4 = build
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

  function handleAttach(slotPath: string, itemId: string | null) {
    if (!build) return;
    const nextAttachments = { ...build.attachments };
    if (itemId === null) delete nextAttachments[slotPath];
    else nextAttachments[slotPath] = itemId;
    onBuildChange({ ...build, attachments: nextAttachments });
  }

  function handleDismissOrphans() {
    if (!build) return;
    onBuildChange({ ...build, orphaned: [] });
  }

  const isLoading = weapons.isLoading || mods.isLoading;
  const loadError = weapons.error ?? mods.error;

  return (
    <Card variant="bracket">
      <CardContent className="flex flex-col gap-4 p-5">
        <SectionTitle
          index={sectionIndex}
          title={`Build ${label}`}
          meta={build ? `${Object.keys(build.attachments).length} attached` : "empty"}
        />

        <div className="flex flex-col gap-2">
          <label
            htmlFor={`compare-weapon-${label}`}
            className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-muted-foreground)]"
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
              <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-muted-foreground)]">
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
                diff={diff ?? undefined}
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Pure helper: compute the {@link WeaponSpec} for one side of the compare
 * workspace. Shared with the parent so stat deltas don't have to reassemble
 * the adapted-weapon / adapted-mods wiring themselves.
 *
 * Returns `null` when the build is missing, the data lists haven't loaded,
 * or the referenced weapon isn't in the current data set (upstream drift).
 */
export function computeSideSpec(
  build: BuildV4 | null,
  weapons: readonly WeaponListItem[] | undefined,
  mods: readonly ModListItem[] | undefined,
): WeaponSpec | null {
  if (!build || !weapons || !mods) return null;
  const weapon = weapons.find((w) => w.id === build.weaponId);
  if (!weapon) return null;
  const attachedIds = new Set(Object.values(build.attachments));
  const attached = mods.filter((m) => attachedIds.has(m.id));
  return weaponSpec(adaptWeapon(weapon), attached.map(adaptMod));
}
