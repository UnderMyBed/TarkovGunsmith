import { itemAvailability } from "@tarkov/data";
import type { AttachablePart, PriceGate, SlotNode } from "@tarkov/data";

/**
 * Returns the set of decisions the DFS must explore for a slot.
 *
 * - Pinned to an item id → that item (from the part catalog) as a singleton.
 *   Availability is IGNORED (user's explicit choice overrides).
 *   If the pinned id isn't in the catalog, returns empty (infeasible).
 * - Pinned empty → [null].
 * - Unpinned → compatible items filtered by availability, plus null.
 */
export function slotCandidates(
  slot: SlotNode,
  parts: ReadonlyMap<string, AttachablePart>,
  profile: PriceGate,
  pinnedSlots: ReadonlyMap<string, string | null>,
): readonly (AttachablePart | null)[] {
  const pin = pinnedSlots.get(slot.path);
  if (pin === null) {
    return [null];
  }
  if (typeof pin === "string") {
    const item = parts.get(pin);
    return item ? [item] : [];
  }
  const compatible: AttachablePart[] = [];
  for (const id of slot.allowedItemIds) {
    const part = parts.get(id);
    if (part !== undefined) compatible.push(part);
  }
  const available = compatible.filter((m) => itemAvailability(m, profile).available);
  return [...available, null];
}
