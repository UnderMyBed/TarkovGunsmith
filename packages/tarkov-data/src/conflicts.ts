import type { AttachablePart } from "./queries/parts.js";
import { slotAtPath, visibleSlots, type WeaponTree } from "./queries/slot-graph.js";

/**
 * Why a candidate part cannot go where the player is trying to put it.
 *
 * - `item`: the candidate and an attached part name each other in `conflictingItems`. Upstream
 *   records most of these pairs in one direction only (11,241 of 14,160 edges), so both
 *   directions are checked.
 * - `slot`: one side blocks a slot the other needs, through `conflictingSlotIds`. Either the
 *   candidate would block a slot that is already filled, or an attached part blocks the slot
 *   the candidate is going into.
 */
export interface Conflict {
  readonly kind: "item" | "slot";
  /** The attached part the candidate clashes with. */
  readonly withItemId: string;
  /** Where that part sits. */
  readonly atPath: string;
  /** For `slot` conflicts, the upstream id of the blocked slot. */
  readonly slotId?: string;
}

export interface ConflictContext {
  readonly tree: WeaponTree;
  readonly attachments: Readonly<Record<string, string>>;
  readonly parts: ReadonlyMap<string, AttachablePart>;
}

/**
 * Every conflict that putting `itemId` at `path` would create with the rest of the build.
 *
 * The current occupant of `path`, and everything attached beneath it, is about to be replaced,
 * so none of it counts. Only parts the build actually shows (`visibleSlots`) are considered: an
 * attachment under an empty or incompatible parent is not on the weapon. An id the catalog does
 * not know carries no conflict data, so it can only be found conflicting from the other side.
 * Slot ids that resolve to no slot in this build (upstream lists some gear slot ids) never match.
 */
export function conflictsWith(
  ctx: ConflictContext,
  candidate: { readonly itemId: string; readonly path: string },
): Conflict[] {
  const { tree, attachments, parts } = ctx;
  const part = parts.get(candidate.itemId);
  const targetSlotId = slotAtPath(tree, attachments, candidate.path)?.id;
  const replaced = (p: string) => p === candidate.path || p.startsWith(`${candidate.path}/`);

  const out: Conflict[] = [];
  for (const slot of visibleSlots(tree, attachments)) {
    if (replaced(slot.path)) continue;
    const attachedId = attachments[slot.path];
    if (attachedId === undefined || !slot.allowedItemIds.has(attachedId)) continue;
    const attached = parts.get(attachedId);

    if (
      part?.conflictingItems.includes(attachedId) === true ||
      attached?.conflictingItems.includes(candidate.itemId) === true
    ) {
      out.push({ kind: "item", withItemId: attachedId, atPath: slot.path });
    }
    if (part?.conflictingSlotIds.includes(slot.id) === true) {
      out.push({ kind: "slot", withItemId: attachedId, atPath: slot.path, slotId: slot.id });
    }
    if (
      targetSlotId !== undefined &&
      attached?.conflictingSlotIds.includes(targetSlotId) === true
    ) {
      out.push({ kind: "slot", withItemId: attachedId, atPath: slot.path, slotId: targetSlotId });
    }
  }
  return out;
}
