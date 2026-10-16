import { mountedAttachments, withAttachment, type BuildV6, type WeaponTree } from "@tarkov/data";

/**
 * The current build with the selected optimizer rows applied.
 *
 * Rows apply parents first, and each change drops what was beneath the replaced part (see
 * `withAttachment`), so an accepted barrel brings only the gas block and muzzle rows accepted
 * with it. A row accepted without its parent row lands under the current parent only if that
 * part has the slot and allows the item; otherwise it is dropped rather than saved as a key
 * nothing displays.
 */
export function buildFromSelection(
  current: BuildV6,
  proposed: BuildV6,
  selected: ReadonlySet<string>,
  tree: WeaponTree,
): BuildV6 {
  const depth = (path: string) => path.split("/").length;
  let merged: Record<string, string> = { ...current.attachments };
  for (const path of [...selected].sort((a, b) => depth(a) - depth(b))) {
    merged = withAttachment(merged, path, proposed.attachments[path] ?? null);
  }
  merged = mountedAttachments(tree, merged);
  return {
    version: 6,
    weaponId: current.weaponId,
    attachments: merged,
    orphaned: current.orphaned,
    createdAt: current.createdAt,
    ...(current.name !== undefined ? { name: current.name } : {}),
    ...(current.description !== undefined ? { description: current.description } : {}),
    ...(current.profileSnapshot !== undefined ? { profileSnapshot: current.profileSnapshot } : {}),
  };
}
