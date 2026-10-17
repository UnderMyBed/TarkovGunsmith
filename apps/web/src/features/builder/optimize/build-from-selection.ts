import { mountedAttachments, type BuildV6, type KnownItems, type WeaponTree } from "@tarkov/data";

/**
 * The current build with the selected optimizer rows applied.
 *
 * Rows are the slot paths whose mounted part differs between the two builds (`slotDiff`). Every
 * other path holds the same part on both sides, so it is kept whichever side its parent comes
 * from: a gas block the proposal kept under its new barrel survives accepting the barrel. For a
 * changed path:
 * - selected: the proposal's part (or empty, if the proposal empties it);
 * - deselected, with its parent still the current part (or at the top level): the current part
 *   stays, because it sits in the same slot of the same part;
 * - deselected, with its parent now a different part: dropped. Its current part belonged to the
 *   part being replaced, and a same-named slot on the new part is a different slot.
 *
 * Paths are decided parents first, so "its parent" means the parent's result, not its row.
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
  const parentKept = (path: string) => {
    const cut = path.lastIndexOf("/");
    if (cut < 0) return true;
    const parent = path.slice(0, cut);
    return merged[parent] === currentOn[parent];
  };
  const depth = (path: string) => path.split("/").length;

  const merged: Record<string, string> = {};
  const paths = [...new Set([...Object.keys(currentOn), ...Object.keys(proposedOn)])];
  for (const path of paths.sort((a, b) => depth(a) - depth(b))) {
    let itemId: string | undefined;
    if (!changed(path)) itemId = currentOn[path];
    else if (selected.has(path)) itemId = proposedOn[path];
    else if (parentKept(path)) itemId = currentOn[path];
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
