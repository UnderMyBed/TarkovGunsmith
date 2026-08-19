import type { BuildV6 } from "@tarkov/data";

export function buildFromSelection(
  current: BuildV6,
  proposed: BuildV6,
  selected: ReadonlySet<string>,
): BuildV6 {
  const merged: Record<string, string> = { ...current.attachments };
  for (const slotId of selected) {
    const proposedValue = proposed.attachments[slotId];
    if (proposedValue === undefined) {
      delete merged[slotId];
    } else {
      merged[slotId] = proposedValue;
    }
  }
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
