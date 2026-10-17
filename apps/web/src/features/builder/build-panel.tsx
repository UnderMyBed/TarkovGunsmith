import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { BuilderMode, ItemAvailability, WeaponTree } from "@tarkov/data";
import { Pill } from "@tarkov/ui";
import type { SlotSelection } from "./slot-selection.js";
import { SlotTree } from "./slot-tree.js";
import { shownAvailability } from "./shown-availability.js";
import { OrphanedBanner } from "./orphaned-banner.js";

export interface BuildPanelProps {
  tree: UseQueryResult<WeaponTree, Error>;
  attachments: Readonly<Record<string, string>>;
  /** Parts on the weapon (`useBuilderState`'s `attachedCount`), not raw attachment keys. */
  attachedCount: number;
  /** Which slot the tree has selected: `useSlotSelection`, shared with the inspector. */
  selection: SlotSelection;
  /** Each part's availability under the Builder's gate (`useBuilderState`'s `gate`). */
  getAvailability: (itemId: string) => ItemAvailability | null;
  /**
   * In theorycraft no fitted part is shown Locked, including the parts nobody sells
   * (`no-sources`, `flea-unlisted`) that even an open gate cannot buy: the mode promises
   * everything unlocked.
   */
  mode: BuilderMode;
  /** See `SlotTree`'s `getFittedConflict`. */
  getFittedConflict?: (path: string) => string | null;
  orphaned: readonly string[];
  modNames: Readonly<Record<string, string>>;
  onDismissOrphaned: () => void;
  /** The preset dropdown, drawn in the panel's header. */
  presets?: ReactNode;
  /** Labels of the required slots the build leaves empty: flags the build incomplete. */
  missingRequired?: readonly string[];
  /** One line per pair of fitted parts that clash ("ADAR stock × M4SS"): flags a conflict. */
  conflicts?: readonly string[];
}

/**
 * The workbench's Build panel: the slot tree, with the part count, the incomplete and conflict
 * flags and the preset dropdown in its header, and the orphaned-part banner under it. Parts are
 * picked in the slot inspector beside it, for the slot selected here.
 */
export function BuildPanel({
  tree,
  attachments,
  attachedCount,
  selection,
  getAvailability,
  mode,
  getFittedConflict,
  orphaned,
  modNames,
  onDismissOrphaned,
  presets,
  missingRequired = [],
  conflicts = [],
}: BuildPanelProps) {
  const availabilityOf = (itemId: string) => shownAvailability(mode, getAvailability(itemId));

  return (
    <section
      aria-label="Build"
      className="min-w-0 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-card)]"
    >
      <div className="flex flex-col gap-3 border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-base font-bold">Build</h2>
            <span className="text-12 text-[var(--color-muted-foreground)]">
              {tree.isLoading && "Loading slot tree…"}
              {tree.error && (
                <span className="text-[var(--color-destructive)]">
                  Couldn&apos;t load slot tree: {tree.error.message}
                </span>
              )}
              {tree.data && `${attachedCount} attached`}
            </span>
            {missingRequired.length > 0 && (
              <Pill tone="marginal" title={`Required slots empty: ${missingRequired.join(", ")}`}>
                Incomplete · {missingRequired.length} required empty
              </Pill>
            )}
            {conflicts.length > 0 && (
              <Pill tone="accent" title={conflicts.join("; ")}>
                Conflict · {conflicts.length}
              </Pill>
            )}
          </div>
        </div>
        {presets}
      </div>
      <div className="flex flex-col gap-3 py-1.5">
        {tree.data && (
          <SlotTree
            selection={selection}
            attachments={attachments}
            getAvailability={availabilityOf}
            getFittedConflict={getFittedConflict}
          />
        )}
        {orphaned.length > 0 && (
          <div className="px-4 pb-2.5">
            <OrphanedBanner orphanedIds={orphaned} names={modNames} onDismiss={onDismissOrphaned} />
          </div>
        )}
      </div>
    </section>
  );
}
