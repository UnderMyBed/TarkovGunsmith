import { pairClashes, type ConflictFields } from "../conflicts.js";
import { expandSlots, type SlotNode, type WeaponTree } from "../queries/slot-graph.js";

/**
 * Why a saved attachment is not on the weapon.
 *
 * - `unknown-item`: the game data does not hold the id at all (upstream removed it).
 * - `not-allowed`: the slot exists, but does not take that item (upstream changed the slot).
 * - `unreachable`: no slot of this build has the path: a parent on the way is empty, holds
 *   another part, or has no such slot.
 */
export type OrphanReason = "unknown-item" | "unreachable" | "not-allowed";

/** A part on the weapon: the slot it fills, at that slot's path. */
export interface PlacedPart<P> {
  readonly path: string;
  readonly itemId: string;
  readonly slot: SlotNode;
  readonly part: P;
}

/** A saved attachment that is not on the weapon, and why. */
export interface OrphanedAttachment {
  readonly path: string;
  readonly itemId: string;
  readonly reason: OrphanReason;
}

/**
 * Two parts on the weapon that cannot be fitted together.
 *
 * - `item`: one names the other in `conflictingItems` (upstream lists most pairs one way only).
 * - `slot`: `a` blocks the slot `b` sits in, through `conflictingSlotIds`; `slotId` is that slot.
 *
 * For `item`, `a` is whichever of the two comes first in slot order.
 */
export interface BuildConflict {
  readonly kind: "item" | "slot";
  readonly a: { readonly path: string; readonly itemId: string };
  readonly b: { readonly path: string; readonly itemId: string };
  readonly slotId?: string;
}

export interface ResolvedBuild<P> {
  /** Every part on the weapon, in slot pre-order, one per filled slot: a part in two slots is two. */
  readonly placed: readonly PlacedPart<P>[];
  /** {@link placed} as a slot path → item id map: the attachments a build holds. */
  readonly attachments: Readonly<Record<string, string>>;
  /** Attachments that are not on the weapon: slot pre-order, then unreachable paths by path. */
  readonly orphaned: readonly OrphanedAttachment[];
  /** Every pair of placed parts that cannot be fitted together. */
  readonly conflicts: readonly BuildConflict[];
  /** Required slots the build shows that hold no part, in slot pre-order. */
  readonly missingRequired: readonly SlotNode[];
}

/**
 * What a build is: which of its attachments are on the weapon, which are not and why, which
 * parts on it clash, and which required slots it leaves empty.
 *
 * The walk starts at the weapon's slots and descends only through the parts actually placed, so
 * a key beneath an empty or replaced parent is never on the weapon, whatever its map says. A
 * slot holding a part that is not on the weapon counts as empty. A part already placed above
 * itself is placed but not expanded again (the cycle guard).
 *
 * Stats, price, the attached count, the comparison diff, the share card and the optimizer all
 * read {@link ResolvedBuild.placed} or {@link ResolvedBuild.attachments}, so they agree on what
 * is fitted.
 */
export function resolveBuild<P extends ConflictFields>(
  tree: WeaponTree,
  attachments: Readonly<Record<string, string>>,
  parts: ReadonlyMap<string, P>,
): ResolvedBuild<P> {
  const placed: PlacedPart<P>[] = [];
  const orphaned: OrphanedAttachment[] = [];
  const missingRequired: SlotNode[] = [];
  const visited = new Set<string>();

  const walk = (slots: readonly SlotNode[], ancestors: ReadonlySet<string>): void => {
    for (const slot of slots) {
      const itemId = attachments[slot.path];
      visited.add(slot.path);
      const part = itemId === undefined ? undefined : parts.get(itemId);
      if (itemId !== undefined && part === undefined) {
        orphaned.push({ path: slot.path, itemId, reason: "unknown-item" });
      } else if (itemId !== undefined && !slot.allowedItemIds.has(itemId)) {
        orphaned.push({ path: slot.path, itemId, reason: "not-allowed" });
      } else if (itemId !== undefined && part !== undefined) {
        placed.push({ path: slot.path, itemId, slot, part });
        if (!ancestors.has(itemId)) {
          walk(expandSlots(tree.graph, itemId, slot.path), new Set([...ancestors, itemId]));
        }
        continue;
      }
      if (slot.required) missingRequired.push(slot);
    }
  };
  walk(tree.slots, new Set([tree.weaponId]));

  const unreachable = Object.keys(attachments)
    .filter((path) => !visited.has(path))
    .sort((a, b) => Number(a > b) - Number(a < b));
  for (const path of unreachable) {
    orphaned.push({ path, itemId: attachments[path]!, reason: "unreachable" });
  }

  return {
    placed,
    attachments: Object.fromEntries(placed.map((p) => [p.path, p.itemId])),
    orphaned,
    conflicts: conflictsAmong(placed),
    missingRequired,
  };
}

function conflictsAmong<P extends ConflictFields>(
  placed: readonly PlacedPart<P>[],
): BuildConflict[] {
  const out: BuildConflict[] = [];
  const at = (p: PlacedPart<P>) => ({
    itemId: p.itemId,
    path: p.path,
    slotId: p.slot.id,
    fields: p.part,
  });
  const ref = (p: PlacedPart<P>) => ({ path: p.path, itemId: p.itemId });
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const x = placed[i]!;
      const y = placed[j]!;
      // From x's side: an item clash, x blocking y's slot, then y blocking x's slot.
      for (const c of pairClashes(at(x), at(y))) {
        if (c.kind === "item") out.push({ kind: "item", a: ref(x), b: ref(y) });
        else if (c.blocker === "x")
          out.push({ kind: "slot", a: ref(x), b: ref(y), slotId: c.slotId });
        else out.push({ kind: "slot", a: ref(y), b: ref(x), slotId: c.slotId });
      }
    }
  }
  return out;
}
