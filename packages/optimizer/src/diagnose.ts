import type { AttachablePart, SlotDef, WeaponTree } from "@tarkov/data";
import { UNKNOWN_PRICE, type Problem, type SolverPart } from "./problem.js";
import { solve } from "./solve.js";
import type { OptimizationResult } from "./types.js";

type Failure = Exclude<
  Extract<OptimizationResult, { ok: false }>,
  { reason: "timeout" | "weapon-unavailable" | "pinned-unpriced" }
>;

export const rub = (amount: number): string => `₽${new Intl.NumberFormat("en-US").format(amount)}`;

/**
 * Why no build exists, after {@link solve} found none. Each cause is tested by taking a
 * constraint away and solving again, in an order that names the one the user can act on:
 *
 * 1. the budget — a complete build exists without it; the message names the cheapest;
 * 2. the pins — a complete build exists without them (and the budget);
 * 3. a required slot — even ignoring conflicts, nothing obtainable fills it on any path;
 * 4. otherwise, every complete build has parts that clash.
 */
export function diagnose(
  problem: Problem,
  tree: WeaponTree,
  catalog: ReadonlyMap<string, AttachablePart>,
  deadline: number,
): Failure {
  const noPins: ReadonlyMap<string, string | null> = new Map();
  if (problem.budget !== undefined) {
    const free = { ...problem, budget: undefined };
    if (solve(free, tree, catalog, deadline) !== null) {
      const flat = new Map<string, SolverPart>();
      for (const [id, part] of problem.parts) flat.set(id, { ...part, stat: 0, key: "" });
      // Every stat zeroed and every key blank rates all builds alike: price decides.
      const cheapest = solve(
        { ...free, parts: flat, multiplier: undefined },
        tree,
        catalog,
        deadline,
      )!;
      const price = cheapest.point.price;
      return {
        ok: false,
        reason: "infeasible-budget",
        message:
          price >= UNKNOWN_PRICE
            ? "No complete build has a known price on this profile, so none can be shown to fit a budget."
            : `The cheapest complete build costs ${rub(price)}, over the ${rub(problem.budget)} budget.`,
      };
    }
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
  return {
    ok: false,
    reason: "no-valid-combinations",
    message: "Every complete build has parts that can't be fitted together.",
  };
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
