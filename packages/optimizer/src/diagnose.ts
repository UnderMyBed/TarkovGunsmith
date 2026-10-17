import type { AttachablePart, SlotDef, WeaponTree } from "@tarkov/data";
import { UNKNOWN_PRICE, type Problem, type SolverPart } from "./problem.js";
import type { Found } from "./search.js";
import { solve } from "./solve.js";
import type { OptimizationResult } from "./types.js";

type PinnedUnpriced = Extract<OptimizationResult, { reason: "pinned-unpriced" }>;

/** The refusal for pinned parts no price the profile can pay is known for. */
export function pinnedUnpriced(
  ids: readonly string[],
  catalog: ReadonlyMap<string, AttachablePart>,
): PinnedUnpriced {
  const names = ids.map((id) => catalog.get(id)!.name);
  return {
    ok: false,
    reason: "pinned-unpriced",
    itemIds: ids,
    message: `No price you can pay is known for ${names.join(", ")}. Unpin ${names.length === 1 ? "it" : "them"} or clear the budget.`,
  };
}

type Failure = Exclude<
  Extract<OptimizationResult, { ok: false }>,
  { reason: "timeout" | "weapon-unavailable" }
>;

export const rub = (amount: number): string => `₽${new Intl.NumberFormat("en-US").format(amount)}`;

/**
 * The cheapest build that keeps the pins, with no budget, or `null` when there is none. Every
 * stat zeroed and every key blank rates all builds alike, so price decides, and the search has
 * no objective to bound: far faster than solving for it.
 */
export function cheapestBuild(
  problem: Problem,
  tree: WeaponTree,
  catalog: ReadonlyMap<string, AttachablePart>,
  deadline: number,
): Found | null {
  const flat = new Map<string, SolverPart>();
  for (const [id, part] of problem.parts) flat.set(id, { ...part, stat: 0, key: "" });
  return solve(
    { ...problem, budget: undefined, parts: flat, multiplier: undefined },
    tree,
    catalog,
    deadline,
  );
}

/**
 * Why no build exists, after {@link solve} found none. Each cause is tested by taking a
 * constraint away and solving again, in an order that names the one the user can act on:
 *
 * 1. the budget — a complete build exists without it. The message names the cheapest, or,
 *    when no build that keeps the pins has a known price, {@link unknownPriceVerdict}'s cause;
 * 2. the pins — a complete build exists without them (and the budget);
 * 3. a required slot — even ignoring conflicts, nothing obtainable fills it on any path;
 * 4. scarce copies — every required slot has a part, but parts that come only with the gun
 *    are needed more often than any way to buy it supplies them;
 * 5. otherwise, every complete build has parts that clash.
 *
 * `cheapest` is {@link cheapestBuild}'s answer, when the caller already has it.
 */
export function diagnose(
  problem: Problem,
  tree: WeaponTree,
  catalog: ReadonlyMap<string, AttachablePart>,
  deadline: number,
  known?: Found | null,
): Failure {
  const noPins: ReadonlyMap<string, string | null> = new Map();
  const cheapest =
    problem.budget === undefined
      ? null
      : known === undefined
        ? cheapestBuild(problem, tree, catalog, deadline)
        : known;
  if (problem.budget !== undefined && cheapest !== null) {
    const price = cheapest.point.price;
    if (price < UNKNOWN_PRICE) {
      return {
        ok: false,
        reason: "infeasible-budget",
        message: `The cheapest complete build costs ${rub(price)}, over the ${rub(problem.budget)} budget.`,
      };
    }
    return unknownPriceVerdict(problem, tree, catalog, deadline);
  }
  const bare = { ...problem, budget: undefined, pins: noPins };
  if (problem.pins.size > 0 && solve(bare, tree, catalog, deadline) !== null) {
    const paths = clashingPins(problem);
    const names = paths.map((path) => {
      const id = problem.pins.get(path);
      return id === null || id === undefined ? `empty ${path}` : (catalog.get(id)?.name ?? id);
    });
    return {
      ok: false,
      reason: "pin-conflict",
      paths,
      message: `No complete build keeps every pin. The pins that clash: ${names.join(", ")}. Unpin one and run it again.`,
    };
  }
  const gap = requiredGap(bare);
  if (gap !== null) {
    const owner = gap.owner === "" ? tree.weaponName : catalog.get(gap.owner)!.name;
    return {
      ok: false,
      reason: "required-slot",
      slotPath: gap.path,
      message: `Nothing you can get fits the ${gap.slot.name} slot, and the ${owner} needs one.`,
    };
  }
  const scarce = scarceParts(bare, tree, catalog, deadline);
  if (scarce !== null) {
    const names = scarce.ids.map((id) => catalog.get(id)!.name);
    const list = names.join(", ");
    return {
      ok: false,
      reason: "required-slot",
      slotPath: scarce.path,
      message: scarce.alone
        ? `You can get the ${list} only with the gun, and no way to buy it comes with ${names.length === 1 ? "as many as" : "as many of each as"} a complete build needs.`
        : `You can get the ${list} only with the gun, and no way to buy it comes with enough of them together for a complete build.`,
    };
  }
  return {
    ok: false,
    reason: "no-valid-combinations",
    message: "Every complete build has parts that can't be fitted together.",
  };
}

/**
 * Why no build that keeps the pins has a known price, when none does. The pins are named only
 * when they are the reason: the cheapest build with every unpriced pin dropped has a known
 * price. Otherwise some part the user did not pin has no known price on every build too, and
 * unpinning would not help.
 */
export function unknownPriceVerdict(
  problem: Problem,
  tree: WeaponTree,
  catalog: ReadonlyMap<string, AttachablePart>,
  deadline: number,
): Failure {
  const unpriced = unpricedPins(problem);
  if (unpriced.size > 0) {
    const pins = new Map(problem.pins);
    for (const path of unpriced.keys()) pins.delete(path);
    const freed = cheapestBuild({ ...problem, pins }, tree, catalog, deadline);
    // A pinned part skips the availability gate, so with its pin dropped there may be no build.
    if (freed !== null && freed.point.price < UNKNOWN_PRICE) {
      return pinnedUnpriced([...new Set(unpriced.values())], catalog);
    }
  }
  return {
    ok: false,
    reason: "infeasible-budget",
    message:
      problem.pins.size > 0
        ? "No complete build that keeps your pins has a known price on this profile, so none can be shown to fit a budget."
        : "No complete build has a known price on this profile, so none can be shown to fit a budget.",
  };
}

/**
 * The pins, path → part, whose part has no price the profile can pay and comes with no way to
 * buy the gun, at a path some build has and whose slot there takes the part: the pins that can
 * leave a build's price unknown.
 */
export function unpricedPins(problem: Problem): Map<string, string> {
  const found = new Map<string, string>();
  for (const [path, id] of problem.pins) {
    const part = id === null ? undefined : problem.parts.get(id);
    if (part === undefined || part.price < UNKNOWN_PRICE) continue;
    if (problem.paths.some((p) => (p.covers.get(part.id) ?? 0) > 0)) continue;
    if (slotsAt(problem, path).some((slot) => slot.allowedItemIds.includes(part.id))) {
      found.set(path, part.id);
    }
  }
  return found;
}

/** Every slot some build can have at `path`: the path's segments followed through each part. */
function slotsAt(problem: Problem, path: string): SlotDef[] {
  let slots: readonly SlotDef[] = problem.rootSlots;
  let here: SlotDef[] = [];
  for (const segment of path.split("/")) {
    here = slots.filter((s) => s.nameId === segment);
    slots = here.flatMap((s) =>
      s.allowedItemIds.flatMap((id) => problem.parts.get(id)?.slots ?? []),
    );
  }
  return here;
}

/**
 * When no build exists even with conflicts ignored, yet every required slot has something to
 * fill it ({@link requiredGap} found none empty), the short supply is copies: parts nobody
 * sells that only the presets supply. `alone` names the parts short even with every other such
 * part to be had freely — no way to buy the gun comes with enough of each. When none is, the
 * shortage is joint (each preset short of one or another), and every such part is named.
 * `null` when conflicts are the cause after all.
 */
function scarceParts(
  problem: Problem,
  tree: WeaponTree,
  catalog: ReadonlyMap<string, AttachablePart>,
  deadline: number,
): { ids: string[]; alone: boolean; path: string } | null {
  const loose = new Map<string, SolverPart>();
  for (const [id, part] of problem.parts) {
    loose.set(id, { ...part, conflictingItems: [], conflictingSlotIds: [] });
  }
  // `resolveBuild` reads conflicts from the catalog: without them it reports none.
  const none = new Map<string, AttachablePart>();
  for (const [id, part] of catalog) {
    none.set(id, { ...part, conflictingItems: [], conflictingSlotIds: [] });
  }
  const free = (parts: ReadonlyMap<string, SolverPart>) =>
    solve({ ...problem, parts }, tree, none, deadline) !== null;
  if (free(loose)) return null;
  const candidates = [...loose.values()].filter(
    (p) => !p.available && problem.paths.some((path) => (path.covers.get(p.id) ?? 0) > 0),
  );
  const short = candidates.filter((c) => {
    const others = new Map(loose);
    for (const o of candidates) if (o !== c) others.set(o.id, { ...o, available: true });
    return !free(others);
  });
  const ids = (short.length > 0 ? short : candidates).map((c) => c.id);
  return { ids, alone: short.length > 0, path: requiredPathTo(problem, new Set(ids)) };
}

/**
 * The first required slot that takes one of `ids`, breadth first from the weapon through the
 * slots every build fills (required through required). One exists: with the pins and conflicts
 * gone, only those slots can make a build need a part, and at least one part
 * {@link scarceParts} names is one that every build needs.
 */
function requiredPathTo(problem: Problem, ids: ReadonlySet<string>): string {
  const queue: [readonly SlotDef[], string][] = [[problem.rootSlots, ""]];
  const seen = new Set<string>();
  for (;;) {
    const [slots, base] = queue.shift()!;
    for (const slot of slots.filter((s) => s.required)) {
      const at = base === "" ? slot.nameId : `${base}/${slot.nameId}`;
      if (slot.allowedItemIds.some((id) => ids.has(id))) return at;
      for (const id of slot.allowedItemIds) {
        const part = problem.parts.get(id);
        if (part === undefined || seen.has(id)) continue;
        seen.add(id);
        queue.push([part.slots, at]);
      }
    }
  }
}

/**
 * The pinned parts that clash with another pinned part; every pin when none clash pairwise
 * (pins can also rule each other out through the slots they force).
 */
function clashingPins(problem: Problem): string[] {
  const pinned = [...problem.pins].filter(
    (entry): entry is [string, string] => entry[1] !== null && problem.parts.has(entry[1]),
  );
  const clashing = new Set<string>();
  for (const [pa, a] of pinned) {
    for (const [pb, b] of pinned) {
      if (pa >= pb) continue;
      const A = problem.parts.get(a)!;
      const B = problem.parts.get(b)!;
      if (A.conflictingItems.includes(b) || B.conflictingItems.includes(a)) {
        clashing.add(pa).add(pb);
      }
    }
  }
  const all = [...problem.pins.keys()];
  return (clashing.size > 0 ? [...clashing] : all).sort();
}

/**
 * The required slot that leaves the problem without a build even when conflicts are ignored,
 * or `null` when such a build exists. Starting at the weapon, it descends while the slot has
 * exactly one part anything could fill it with, so a chain (a receiver whose barrel cannot be
 * had) names the slot that is really empty.
 */
function requiredGap(problem: Problem): { slot: SlotDef; path: string; owner: string } | null {
  const fillable = problem.paths.map((path) => {
    const obtainable = (id: string) => {
      const part = problem.parts.get(id);
      return part !== undefined && (part.available || (path.covers.get(id) ?? 0) > 0);
    };
    const memo = new Map<string, boolean>();
    const partOk = (id: string): boolean => {
      const hit = memo.get(id);
      if (hit !== undefined) return hit;
      memo.set(id, false);
      const ok = problem.parts.get(id)!.slots.every((slot) => slotOk(slot));
      memo.set(id, ok);
      return ok;
    };
    const slotOk = (slot: SlotDef): boolean =>
      !slot.required || slot.allowedItemIds.some((id) => obtainable(id) && partOk(id));
    return { obtainable, slotOk };
  });
  if (fillable.some((f) => problem.rootSlots.every(f.slotOk))) return null;
  const failsEverywhere = (slot: SlotDef) => fillable.every((f) => !f.slotOk(slot));
  // Each path fails somewhere; name the slot they all fail at, else the first path's.
  let slot =
    problem.rootSlots.find(failsEverywhere) ??
    problem.rootSlots.find((s) => !fillable[0]!.slotOk(s))!;
  let path = slot.nameId;
  let owner = "";
  for (;;) {
    const candidates = slot.allowedItemIds.filter((id) => fillable.some((f) => f.obtainable(id)));
    const deeper =
      candidates.length === 1
        ? problem.parts.get(candidates[0]!)!.slots.find(failsEverywhere)
        : undefined;
    if (deeper === undefined) return { slot, path, owner };
    owner = candidates[0]!;
    slot = deeper;
    path = `${path}/${deeper.nameId}`;
  }
}
