import { mountedAttachments, type BuildV6, type KnownItems, type WeaponTree } from "@tarkov/data";

/**
 * The current build with the selected optimizer rows applied.
 *
 * Rows are the slot paths whose mounted part differs between the two builds (`slotDiff`). Every
 * other path holds the same part on both sides, so it is kept whichever side its parent comes
 * from: a gas block the proposal kept under its new barrel survives accepting the barrel. For a
 * changed path:
 * - selected: the proposal's part (or empty, if the proposal empties it);
 * - deselected, beneath a selected row: dropped. Its current part belonged to the part being
 *   replaced, and a same-named slot on the new part is a different slot;
 * - deselected otherwise: the current part stays.
 *
 * The result keeps only what then mounts (`mountedAttachments`): a part accepted under a parent
 * the user kept lands only if that parent has the slot and allows it.
 */
export function buildFromSelection(
  current: BuildV6,
  proposed: BuildV6,
  selected: ReadonlySet<string>,
  tree: WeaponTree,
  parts: KnownItems,
): BuildV6 {
  const currentOn = mountedAttachments(tree, current.attachments, parts);
  const proposedOn = mountedAttachments(tree, proposed.attachments, parts);
  const changed = (path: string) => currentOn[path] !== proposedOn[path];
  const replaced = (path: string) => selected.has(path) && changed(path);
  const underReplaced = (path: string) => {
    const segments = path.split("/");
    for (let i = 1; i < segments.length; i++) {
      if (replaced(segments.slice(0, i).join("/"))) return true;
    }
    return false;
  };

  const merged: Record<string, string> = {};
  for (const path of new Set([...Object.keys(currentOn), ...Object.keys(proposedOn)])) {
    let itemId: string | undefined;
    if (!changed(path)) itemId = currentOn[path];
    else if (selected.has(path)) itemId = proposedOn[path];
    else if (!underReplaced(path)) itemId = currentOn[path];
    if (itemId !== undefined) merged[path] = itemId;
  }
  const attachments = mountedAttachments(tree, merged, parts);
  return {
    version: 6,
    weaponId: current.weaponId,
    attachments,
    orphaned: current.orphaned,
    createdAt: current.createdAt,
    ...(current.name !== undefined ? { name: current.name } : {}),
    ...(current.description !== undefined ? { description: current.description } : {}),
    ...(current.profileSnapshot !== undefined ? { profileSnapshot: current.profileSnapshot } : {}),
  };
}
