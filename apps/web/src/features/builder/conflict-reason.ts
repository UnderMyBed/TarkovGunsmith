import {
  conflictsWith,
  type AttachablePart,
  type BuildConflict,
  type WeaponTree,
} from "@tarkov/data";

/**
 * Build the `getConflict` callback `SlotInspector` takes: for a candidate part at a slot path, the
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

/**
 * Build `SlotTree`'s `getFittedConflict` from a resolved build's conflicts: for the part at a
 * path, which part on the weapon it clashes with, as "Conflicts with <name>" (several read as
 * the first plus a count), or `null`. `nameOf` names an item id.
 */
export function fittedConflictReasonFor(
  conflicts: readonly BuildConflict[],
  nameOf: (itemId: string) => string,
): (path: string) => string | null {
  const others = new Map<string, string[]>();
  const add = (path: string, itemId: string) => {
    const list = others.get(path) ?? [];
    if (!list.includes(itemId)) list.push(itemId);
    others.set(path, list);
  };
  for (const { a, b } of conflicts) {
    add(a.path, b.itemId);
    add(b.path, a.itemId);
  }
  return (path) => {
    const [first, ...rest] = others.get(path) ?? [];
    if (first === undefined) return null;
    return rest.length > 0
      ? `Conflicts with ${nameOf(first)} +${rest.length}`
      : `Conflicts with ${nameOf(first)}`;
  };
}
