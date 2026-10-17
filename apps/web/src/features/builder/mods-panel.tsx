import { useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { BuilderMode, ItemAvailability, WeaponTree } from "@tarkov/data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@tarkov/ui";
import { SlotTree } from "./slot-tree.js";
import { shownAvailability } from "./shown-availability.js";
import { OrphanedBanner } from "./orphaned-banner.js";

export interface ModsPanelProps {
  tree: UseQueryResult<WeaponTree, Error>;
  attachments: Readonly<Record<string, string>>;
  /** Parts on the weapon (`useBuilderState`'s `attachedCount`), not raw attachment keys. */
  attachedCount: number;
  onAttach: (path: string, itemId: string | null) => void;
  /** Each part's availability under the Builder's gate (`useBuilderState`'s `gate`). */
  getAvailability: (itemId: string) => ItemAvailability | null;
  /**
   * In theorycraft no part is shown locked or dimmed for availability, including the parts
   * nobody sells (`no-sources`, `flea-unlisted`) that even an open gate cannot buy: the mode
   * promises everything unlocked. A part that clashes with the build is still dimmed.
   */
  mode: BuilderMode;
  /** See `SlotTree`'s `getConflict`. */
  getConflict: (path: string, itemId: string) => string | null;
  /** See `SlotTree`'s `getFittedConflict`. */
  getFittedConflict?: (path: string) => string | null;
  orphaned: readonly string[];
  modNames: Readonly<Record<string, string>>;
  onDismissOrphaned: () => void;
}

/**
 * The "Mods" card: slot tree + orphaned-mod banner. Owns the "Show all items" toggle locally:
 * it only sets whether a part the profile cannot get is dimmed, which is not a mode and nothing
 * outside this panel reads. It is offered in progression only; theorycraft shows every part
 * undimmed and without a LOCKED pill.
 */
export function ModsPanel({
  tree,
  attachments,
  attachedCount,
  onAttach,
  getAvailability,
  mode,
  getConflict,
  getFittedConflict,
  orphaned,
  modNames,
  onDismissOrphaned,
}: ModsPanelProps) {
  const [showAll, setShowAll] = useState(false);
  const theorycraft = mode === "theorycraft";
  const availabilityOf = (itemId: string) => shownAvailability(mode, getAvailability(itemId));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Mods</CardTitle>
            <CardDescription>
              {tree.isLoading && "Loading slot tree…"}
              {tree.error && (
                <span className="text-[var(--color-destructive)]">
                  Couldn&apos;t load slot tree: {tree.error.message}
                </span>
              )}
              {tree.data && `${attachedCount} attached`}
            </CardDescription>
          </div>
          {mode === "progression" && (
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
              />
              <span>Show all items</span>
            </label>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {tree.data && (
          <SlotTree
            tree={tree.data}
            attachments={attachments}
            onAttach={onAttach}
            getAvailability={availabilityOf}
            getConflict={getConflict}
            getFittedConflict={getFittedConflict}
            showAll={theorycraft || showAll}
          />
        )}
        <OrphanedBanner orphanedIds={orphaned} names={modNames} onDismiss={onDismissOrphaned} />
      </CardContent>
    </Card>
  );
}
