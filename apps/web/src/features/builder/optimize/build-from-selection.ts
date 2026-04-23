import type { BuildV4 } from "@tarkov/data";

export function buildFromSelection(
  current: BuildV4,
  proposed: BuildV4,
  selected: ReadonlySet<string>,
): BuildV4 {
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
    version: 4,
    weaponId: current.weaponId,
    attachments: merged,
    orphaned: current.orphaned,
    createdAt: current.createdAt,
    ...(current.name !== undefined ? { name: current.name } : {}),
    ...(current.description !== undefined ? { description: current.description } : {}),
    ...(current.profileSnapshot !== undefined ? { profileSnapshot: current.profileSnapshot } : {}),
  };
}
