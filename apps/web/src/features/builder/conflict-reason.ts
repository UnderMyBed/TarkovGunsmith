import { conflictsWith, type AttachablePart, type WeaponTree } from "@tarkov/data";

/**
 * Build the `getConflict` callback `SlotTree` takes: for a candidate part at a slot path, the
 * reason it cannot go there given the rest of the build, or `null` when it can.
 *
 * The reason names the part already fitted that it clashes with — the one the player has to
 * remove first. Several clashes read as the first plus a count.
 */
export function conflictReasonFor(
  tree: WeaponTree,
  attachments: Readonly<Record<string, string>>,
  parts: ReadonlyMap<string, AttachablePart>,
): (path: string, itemId: string) => string | null {
  return (path, itemId) => {
    const conflicts = conflictsWith({ tree, attachments, parts }, { itemId, path });
    const first = conflicts[0];
    if (first === undefined) return null;
    const name = parts.get(first.withItemId)?.shortName ?? first.withItemId;
    const others = new Set(conflicts.map((c) => c.withItemId)).size - 1;
    return others > 0 ? `Conflicts with ${name} +${others}` : `Conflicts with ${name}`;
  };
}
