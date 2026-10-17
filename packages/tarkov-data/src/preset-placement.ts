import { conflictsWith, type ConflictFields } from "./conflicts.js";
import { expandSlots, visibleSlots, type SlotNode, type WeaponTree } from "./queries/slot-graph.js";

/** One `containsItems` entry of an upstream preset: an item and how many of it. */
export interface PresetPart {
  readonly itemId: string;
  readonly count: number;
}

export interface PlacePresetInput {
  readonly tree: WeaponTree;
  /**
   * The preset's parts, weapon excluded, in upstream `containsItems` order. That order is the
   * tie-break between items that fit the same slot.
   */
  readonly parts: readonly PresetPart[];
  /** Whether an item is a cartridge (upstream `types` includes `"ammo"`). */
  readonly isCartridge: (itemId: string) => boolean;
  /** Conflict data for the preset's parts. An id it does not hold carries no conflicts. */
  readonly conflicts: ReadonlyMap<string, ConflictFields>;
  /** Search nodes allowed before giving up. Defaults to {@link DEFAULT_MAX_NODES}. */
  readonly maxNodes?: number;
}

/**
 * Why a preset could not be placed.
 *
 * - `unreachable`: no slot the weapon can ever show accepts these parts.
 * - `no-fit`: every part is reachable, but not all of them fit at once (too few slots, or
 *   conflicts).
 * - `node-limit`: the search gave up before deciding.
 */
export type PresetPlacementFailure = "unreachable" | "no-fit" | "node-limit";

export type PresetPlacement =
  | {
      readonly placed: true;
      /** Slot path → item id, the shape a build's `attachments` uses. */
      readonly attachments: Record<string, string>;
      /** The preset's loaded rounds, which sit in a magazine or chamber rather than a slot. */
      readonly cartridges: readonly PresetPart[];
    }
  | {
      readonly placed: false;
      readonly reason: PresetPlacementFailure;
      /**
       * For `unreachable`, the parts no slot accepts. Otherwise every non-cartridge part: no
       * partial placement is kept.
       */
      readonly itemIds: readonly string[];
    };

/**
 * Generous against what the live presets need: placing all 399 upstream weapon presets takes
 * at most 31 nodes each (median 14, measured 2026-10-16).
 */
export const DEFAULT_MAX_NODES = 10_000;

/**
 * Place an upstream preset's parts into the weapon's slot graph.
 *
 * Upstream lists a preset as a flat `containsItems` list with no slot positions, so the
 * positions are recovered by search: a depth-first walk over the build's slots in pre-order
 * ({@link visibleSlots}), deciding one slot at a time. Each slot tries every distinct remaining
 * part it allows, in `containsItems` order, then tries staying empty. Fitting a part opens its
 * own slots, so nested parts need no special case. A branch is cut as soon as some remaining
 * part can no longer be reached from the undecided slots, directly or through another
 * remaining part's slots.
 *
 * - **Counts.** A part listed with `count: 3` is three physical parts in three slots. This is
 *   an assumption, matching `resolveBuild` and the in-game sum over fitted mods, but
 *   not verified in-game. Upstream's own preset ergonomics count each distinct part once, so
 *   the presets that repeat a part read differently from upstream's figure
 *   (`preset-oracle.test.ts` pins the exact difference).
 * - **Cartridges** are never slotted. They are the preset's loaded rounds, returned in
 *   `cartridges`. No live preset loads a revolver cylinder, the one place a slot holds ammo.
 * - **Conflicts** are hard rules: a part is never fitted where {@link conflictsWith} objects.
 * - **Ambiguity.** Upstream has no positions, so a preset can have several valid placements
 *   (81 of 399 live weapon presets do, e.g. which rail a flashlight sits on). They hold the
 *   same parts, so their stats are identical. The first one found wins: the earliest slot in
 *   pre-order is filled first, with parts tried in `containsItems` order. The same input
 *   always gives the same placement.
 * - **Cost.** Exponential in the number of slots in principle, so the search is capped at
 *   `maxNodes` and reports `node-limit` past it. Each node costs one {@link visibleSlots} walk plus a
 *   reachability pass over the remaining parts.
 *
 * Returns `placed: false`, naming the parts left over, when not every non-cartridge part can be
 * placed.
 */
export function placePreset(input: PlacePresetInput): PresetPlacement {
  const { tree, isCartridge, conflicts } = input;
  const maxNodes = input.maxNodes ?? DEFAULT_MAX_NODES;

  const order = new Map<string, number>();
  const remaining = new Map<string, number>();
  const cartridges: PresetPart[] = [];
  for (const [index, part] of input.parts.entries()) {
    if (isCartridge(part.itemId)) {
      cartridges.push(part);
      continue;
    }
    if (!order.has(part.itemId)) order.set(part.itemId, index);
    remaining.set(part.itemId, (remaining.get(part.itemId) ?? 0) + part.count);
  }

  const unplaced = (): string[] => [...remaining].filter(([, n]) => n > 0).map(([id]) => id);

  // Remaining parts no undecided slot can take, directly or through another remaining part.
  const unreachable = (frontier: readonly SlotNode[]): string[] => {
    const seen = new Set<string>();
    const stack: string[] = [];
    const visit = (slots: readonly SlotNode[]): void => {
      for (const slot of slots) {
        for (const [id, n] of remaining) {
          if (n > 0 && !seen.has(id) && slot.allowedItemIds.has(id)) {
            seen.add(id);
            stack.push(id);
          }
        }
      }
    };
    visit(frontier);
    for (let id = stack.pop(); id !== undefined; id = stack.pop()) {
      visit(expandSlots(tree.graph, id, ""));
    }
    return unplaced().filter((id) => !seen.has(id));
  };

  const never = unreachable(tree.slots);
  if (never.length > 0) return { placed: false, reason: "unreachable", itemIds: never };

  const attachments: Record<string, string> = {};
  const decided = new Set<string>();
  let nodes = 0;

  // "done": every part placed. "dead": this branch cannot place them all. "limit": out of nodes.
  const search = (): "done" | "dead" | "limit" => {
    if (unplaced().length === 0) return "done";
    nodes += 1;
    if (nodes > maxNodes) return "limit";
    const frontier = visibleSlots(tree, attachments).filter((s) => !decided.has(s.path));
    if (unreachable(frontier).length > 0) return "dead";
    // A part remains and is reachable, so some undecided slot exists.
    const slot = frontier[0] as SlotNode;
    decided.add(slot.path);
    const candidates = unplaced()
      .filter((id) => slot.allowedItemIds.has(id))
      .sort((a, b) => (order.get(a) as number) - (order.get(b) as number));
    for (const itemId of candidates) {
      const ctx = { tree, attachments, parts: conflicts };
      if (conflictsWith(ctx, { itemId, path: slot.path }).length > 0) continue;
      attachments[slot.path] = itemId;
      remaining.set(itemId, (remaining.get(itemId) as number) - 1);
      const outcome = search();
      if (outcome !== "dead") return outcome;
      remaining.set(itemId, (remaining.get(itemId) as number) + 1);
      delete attachments[slot.path];
    }
    const outcome = search();
    if (outcome !== "dead") return outcome;
    decided.delete(slot.path);
    return "dead";
  };

  const outcome = search();
  if (outcome === "done") return { placed: true, attachments, cartridges };
  return {
    placed: false,
    reason: outcome === "limit" ? "node-limit" : "no-fit",
    itemIds: [...remaining.keys()],
  };
}
