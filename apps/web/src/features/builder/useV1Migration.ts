import { useState } from "react";
import { migrateV1ToV2, type BuildV1, type SlotNodeForMigration } from "@tarkov/data";

/**
 * One-shot v1 -> v2 migration for a legacy shared build URL, run as soon as the weapon tree
 * it depends on has loaded. Originally extracted from `BuilderPage` (a 600+ line
 * router-coupled page component with no existing test harness) so this logic — 100% of what
 * the original react-hooks/set-state-in-effect finding was about — can be exercised directly
 * with `renderHook`, independent of TanStack Router/Query context. Moved into its own file as
 * part of the `BuilderPage` decomposition; `builder.test.tsx` imports it from here.
 *
 * This used to be a useEffect that called setAttachments + setOrphaned after commit: render
 * once with empty attachments, paint that, then the effect fires and forces a second render
 * + paint with the migrated ones — a visible flash on every legacy-link load, on the app's
 * busiest route. Setting state directly during render (guarded so it only fires once) is
 * React's documented alternative for this exact shape —
 * https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
 * React discards the in-progress render and immediately re-renders with the migrated state
 * before anything paints, so there is only ever one visible render.
 */
export function useV1Migration(
  initialWeaponId: string,
  initialModIds: string[] | undefined,
  treeSlots: readonly SlotNodeForMigration[] | undefined,
  setAttachments: (attachments: Record<string, string>) => void,
  setOrphaned: (orphaned: string[]) => void,
): void {
  const [migrated, setMigrated] = useState(false);
  if (!migrated && initialModIds && treeSlots) {
    setMigrated(true);
    const v1: BuildV1 = {
      version: 1,
      weaponId: initialWeaponId,
      modIds: initialModIds,
      createdAt: new Date(0).toISOString(),
    };
    // The tree's SlotNode structurally extends SlotNodeForMigration.
    const v2 = migrateV1ToV2(v1, treeSlots);
    setAttachments(v2.attachments);
    setOrphaned(v2.orphaned);
  }
}
