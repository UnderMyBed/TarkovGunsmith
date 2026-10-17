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

/** The two fields conflict checks read. Any {@link AttachablePart} has them. */
export type ConflictFields = Pick<AttachablePart, "conflictingItems" | "conflictingSlotIds">;

export interface ConflictContext {
  readonly tree: WeaponTree;
  readonly attachments: Readonly<Record<string, string>>;
  readonly parts: ReadonlyMap<string, ConflictFields>;
}

/** One part at one slot, as the pairwise conflict rule reads it. */
export interface PlacedForConflict {
  readonly itemId: string;
  readonly path: string;
  /** Upstream id of the slot the part sits in (or is going into); `undefined` when unknown. */
  readonly slotId: string | undefined;
  /** The part's conflict lists; `undefined` for an id the catalog does not hold. */
  readonly fields: ConflictFields | undefined;
}

/**
 * How two parts clash, if they do:
 *
 * - `{ kind: "item" }`: they name each other in `conflictingItems`, in either direction;
 * - `{ kind: "slot", blocker: "x" }`: `x` blocks the slot `y` sits in, through
 *   `conflictingSlotIds`, and `slotId` is that slot;
 * - `{ kind: "slot", blocker: "y" }`: the same the other way round.
 *
 * The one rule both {@link conflictsWith} (a candidate against the build) and `resolveBuild`
 * (every pair already on the weapon) apply.
 */
export type PairClash =
  | { readonly kind: "item" }
  | { readonly kind: "slot"; readonly blocker: "x" | "y"; readonly slotId: string };

export function pairClashes(x: PlacedForConflict, y: PlacedForConflict): PairClash[] {
  const out: PairClash[] = [];
  if (
    x.fields?.conflictingItems.includes(y.itemId) === true ||
    y.fields?.conflictingItems.includes(x.itemId) === true
  ) {
    out.push({ kind: "item" });
  }
  if (y.slotId !== undefined && x.fields?.conflictingSlotIds.includes(y.slotId) === true) {
    out.push({ kind: "slot", blocker: "x", slotId: y.slotId });
  }
  if (x.slotId !== undefined && y.fields?.conflictingSlotIds.includes(x.slotId) === true) {
    out.push({ kind: "slot", blocker: "y", slotId: x.slotId });
  }
  return out;
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
  const self: PlacedForConflict = {
    itemId: candidate.itemId,
    path: candidate.path,
    slotId: slotAtPath(tree, attachments, candidate.path)?.id,
    fields: parts.get(candidate.itemId),
  };
  const replaced = (p: string) => p === candidate.path || p.startsWith(`${candidate.path}/`);

  const out: Conflict[] = [];
  for (const slot of visibleSlots(tree, attachments)) {
    if (replaced(slot.path)) continue;
    const attachedId = attachments[slot.path];
    if (attachedId === undefined || !slot.allowedItemIds.has(attachedId)) continue;
    const other = {
      itemId: attachedId,
      path: slot.path,
      slotId: slot.id,
      fields: parts.get(attachedId),
    };
    for (const clash of pairClashes(self, other)) {
      out.push(
        clash.kind === "item"
          ? { kind: "item", withItemId: attachedId, atPath: slot.path }
          : { kind: "slot", withItemId: attachedId, atPath: slot.path, slotId: clash.slotId },
      );
    }
  }
  return out;
}
