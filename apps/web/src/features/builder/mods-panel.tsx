import { useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ItemAvailability, WeaponTree } from "@tarkov/data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@tarkov/ui";
import { SlotTree } from "./slot-tree.js";
import { OrphanedBanner } from "./orphaned-banner.js";

export interface ModsPanelProps {
  tree: UseQueryResult<WeaponTree, Error>;
  attachments: Readonly<Record<string, string>>;
  onAttach: (path: string, itemId: string | null) => void;
  getAvailability: (itemId: string) => ItemAvailability | null;
  getModSources: (itemId: string) => { hasCraft: boolean; hasBarter: boolean };
  orphaned: readonly string[];
  modNames: Readonly<Record<string, string>>;
  onDismissOrphaned: () => void;
}

/**
 * The "Mods" card: slot tree + orphaned-mod banner. Owns the "Show all items" toggle locally
 * — nothing outside this panel reads it, so unlike `showAllWeapons` (which feeds the weapon
 * list filter one level up) it doesn't need to live in `useBuilderState`.
 */
export function ModsPanel({
  tree,
  attachments,
  onAttach,
  getAvailability,
  getModSources,
  orphaned,
  modNames,
  onDismissOrphaned,
}: ModsPanelProps) {
  const [showAll, setShowAll] = useState(false);

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
              {tree.data && `${Object.keys(attachments).length} attached`}
            </CardDescription>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
            />
            <span>Show all items</span>
          </label>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {tree.data && (
          <SlotTree
            tree={tree.data}
            attachments={attachments}
            onAttach={onAttach}
            getAvailability={getAvailability}
            getModSources={getModSources}
            showAll={showAll}
          />
        )}
        <OrphanedBanner orphanedIds={orphaned} names={modNames} onDismiss={onDismissOrphaned} />
      </CardContent>
    </Card>
  );
}
