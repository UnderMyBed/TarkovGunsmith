import { itemAvailability } from "@tarkov/data";
import type { ModListItem, PlayerProfile, SlotNode } from "@tarkov/data";

/**
 * Returns the cheapest RUB price at which `item` is obtainable under the
 * given player profile, or `null` if the item is unavailable.
 */
export function cheapestPrice(item: ModListItem, profile: PlayerProfile): number | null {
  const avail = itemAvailability(item, profile);
  if (!avail.available) return null;
  return avail.priceRUB;
}

/**
 * Returns the set of decisions the DFS must explore for a slot.
 *
 * - Pinned to an item id → that item (from modList) as a singleton.
 *   Availability is IGNORED (user's explicit choice overrides).
 *   If the pinned id isn't present in `modList`, returns empty (infeasible).
 * - Pinned empty → [null].
 * - Unpinned → compatible items filtered by availability, plus null.
 */
export function slotCandidates(
  slot: SlotNode,
  modList: readonly ModListItem[],
  profile: PlayerProfile,
  pinnedSlots: ReadonlyMap<string, string | null>,
): readonly (ModListItem | null)[] {
  const pin = pinnedSlots.get(slot.path);
  if (pin === null) {
    return [null];
  }
  if (typeof pin === "string") {
    const item = modList.find((m) => m.id === pin);
    return item ? [item] : [];
  }
  const compatible = modList.filter((m) => slot.allowedItemIds.has(m.id));
  const available = compatible.filter((m) => itemAvailability(m, profile).available);
  return [...available, null];
}
