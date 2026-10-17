import type { BallisticWeapon, WeaponSpec } from "@tarkov/ballistics";
import { weaponSpec } from "@tarkov/ballistics";
import type { AttachablePart, PriceGate, SlotGraph, SlotNode } from "@tarkov/data";
import { adaptMod, expandSlots, priceUnder } from "@tarkov/data";
import { slotCandidates } from "./feasibility.js";
import { lowerBoundForRemaining } from "./bounds.js";
import { score } from "./objective.js";
import type { Objective } from "./types.js";

export interface BnbState {
  readonly weapon: BallisticWeapon;
  /** The part catalog, indexed by id. */
  readonly parts: ReadonlyMap<string, AttachablePart>;
  /** The slot graph sub-slots expand from, one level per attached candidate. */
  readonly graph: SlotGraph;
  readonly profile: PriceGate;
  readonly pinnedSlots: ReadonlyMap<string, string | null>;
  readonly objective: Objective;
  readonly budgetRub: number | undefined;
  /**
   * The ways to buy the weapon, each with its price (`Infinity` when not known) and the parts
   * it comes with. A build's price is the cheapest of: a path's price plus every part that
   * path does not supply. With no budget these only break ties.
   */
  readonly paths: readonly BudgetPath[];
  /** `Date.now()` deadline in ms; checked periodically via onNodeVisit. */
  readonly deadline: number;
  /**
   * Called roughly every 1000 node visits. Returns `false` to abort early
   * (used for timeout enforcement).
   */
  readonly onNodeVisit: (visits: number) => boolean;
}

/** One way to buy the weapon, as the search prices it. */
export interface BudgetPath {
  /** `Infinity` when the path's price is not known: it can never be shown to fit a budget. */
  readonly price: number;
  /** Item id → how many of it the path supplies. */
  readonly covers: ReadonlyMap<string, number>;
}

/** What the DFS carries per path: the total so far and the parts still supplied free. */
interface PathState {
  total: number;
  readonly left: Map<string, number>;
}

export interface BnbBest {
  readonly attachments: Readonly<Record<string, string>>;
  readonly score: number;
  readonly price: number;
  readonly stats: WeaponSpec;
}

interface MutableBest {
  attachments: Record<string, string>;
  score: number;
  price: number;
  stats: WeaponSpec;
}

/**
 * Runs a heuristic branch-and-bound DFS over the slot tree and returns the
 * best (lowest-score) leaf it found, or `null` if no leaf was ever reached
 * (e.g. the onNodeVisit callback aborted before the first completion).
 *
 * Not provably optimal: the pruning bound covers only the slots already
 * pending, not the sub-slots of candidates not yet chosen, so it can cut a
 * branch whose deeper parts would have won. A result may also leave a
 * required slot empty or contain conflicting parts. #225 owns all three.
 *
 * Tie-breaking: lower price wins; then lexicographic order of the sorted
 * attachments map ensures determinism.
 */
export function branchAndBound(state: BnbState, slots: readonly SlotNode[]): BnbBest | null {
  const best: { value: MutableBest | null } = { value: null };
  const visits = { count: 0 };
  const root: ReadonlySet<string> = new Set();
  const paths: PathState[] = state.paths.map((p) => ({ total: p.price, left: new Map(p.covers) }));
  dfs(
    state,
    slots.map((slot) => ({ slot, ancestors: root })),
    [],
    paths,
    {},
    best,
    visits,
  );
  return best.value;
}

/** A slot still to decide, with the item ids attached above it (the cycle guard). */
interface PendingSlot {
  readonly slot: SlotNode;
  readonly ancestors: ReadonlySet<string>;
}

function dfs(
  state: BnbState,
  remainingSlots: readonly PendingSlot[],
  partialMods: AttachablePart[],
  paths: PathState[],
  attachments: Record<string, string>,
  best: { value: MutableBest | null },
  visits: { count: number },
): boolean {
  visits.count += 1;
  if (visits.count % 1000 === 0) {
    if (!state.onNodeVisit(visits.count)) return false;
    if (Date.now() >= state.deadline) return false;
  }

  if (remainingSlots.length === 0) {
    // Leaf.
    const runningPrice = cheapest(paths);
    const stats = weaponSpec(state.weapon, partialMods.map(adaptMod));
    const leafScore = score(state.objective, stats);
    if (
      best.value === null ||
      leafScore < best.value.score ||
      // v8 ignore next — unreachable with tight bound + `>=` pruning;
      // kept as a safety net for future looser heuristics. See
      // tieBreakBetter's docblock.
      (leafScore === best.value.score && tieBreakBetter(runningPrice, attachments, best.value))
    ) {
      best.value = {
        attachments: { ...attachments },
        score: leafScore,
        price: runningPrice,
        stats,
      };
    }
    return true;
  }

  const [pending, ...rest] = remainingSlots;
  // Defensive: `pending` is guaranteed defined by the `remainingSlots.length === 0`
  // early-return above, but TS's `noUncheckedIndexedAccess` forces the guard.
  /* v8 ignore next */
  if (!pending) return true;
  const { slot, ancestors } = pending;
  // An item already attached above this slot cannot go in it again: that would be a cycle in
  // the slot graph, which the live document does not have but nothing upstream guarantees.
  const candidates = slotCandidates(slot, state.parts, state.profile, state.pinnedSlots).filter(
    (c) => c === null || !ancestors.has(c.id),
  );

  // Sort candidates best-first (by single-item score) for better pruning.
  const sorted = [...candidates].sort(
    (a, b) => singleItemScore(state.objective, a) - singleItemScore(state.objective, b),
  );

  for (const candidate of sorted) {
    // Budget check. A candidate a path supplies is free on that path; elsewhere it costs its
    // price under the profile, and an unknown price (or none: a pinned part the profile cannot
    // buy) is `Infinity` on that path, never 0. `optimize` has already refused a budget run
    // whose pins no path can price, so an `Infinity` here only rules out paths.
    const totals = paths.map((path) => path.total);
    const taken: boolean[] = [];
    if (candidate !== null) {
      const price = priceUnder(state.profile, candidate) ?? Number.POSITIVE_INFINITY;
      for (const path of paths) {
        const left = path.left.get(candidate.id) ?? 0;
        taken.push(left > 0);
        if (left > 0) path.left.set(candidate.id, left - 1);
        else path.total += price;
      }
    }
    // Restores exactly what was there: subtracting an `Infinity` back out would leave NaN.
    const undo = (): void => {
      paths.forEach((path, i) => {
        path.total = totals[i]!;
        if (taken[i] === true) path.left.set(candidate!.id, path.left.get(candidate!.id)! + 1);
      });
    };
    if (state.budgetRub !== undefined && cheapest(paths) > state.budgetRub) {
      undo();
      continue;
    }

    // Sub-slots unlocked by this item, expanded lazily from the graph.
    const subSlots: readonly PendingSlot[] = candidate
      ? expandSlots(state.graph, candidate.id, slot.path).map((sub) => ({
          slot: sub,
          ancestors: new Set([...ancestors, candidate.id]),
        }))
      : [];
    const newRemaining = [...subSlots, ...rest];

    // Lower-bound pruning.
    if (best.value !== null) {
      const partialForBoundCheck = candidate ? [...partialMods, candidate] : partialMods;
      const runningStats = weaponSpec(state.weapon, partialForBoundCheck.map(adaptMod));
      const bound = lowerBoundForRemaining(
        newRemaining.map((p) => p.slot),
        state.parts,
        state.profile,
        state.pinnedSlots,
        state.objective,
        state.weapon,
      );
      const projectedScore = score(state.objective, runningStats) + bound;
      if (projectedScore >= best.value.score) {
        undo();
        continue;
      }
    }

    if (candidate) {
      attachments[slot.path] = candidate.id;
      partialMods.push(candidate);
    }
    const keepGoing = dfs(state, newRemaining, partialMods, paths, attachments, best, visits);
    if (candidate) {
      partialMods.pop();
      delete attachments[slot.path];
    }
    undo();
    if (!keepGoing) return false;
  }

  return true;
}

/** The build's price so far: its cheapest path. `Infinity` when none is known. */
function cheapest(paths: readonly PathState[]): number {
  let min = Number.POSITIVE_INFINITY;
  for (const path of paths) if (path.total < min) min = path.total;
  return min;
}

function singleItemScore(objective: Objective, item: AttachablePart | null): number {
  if (item === null) return 0;
  const mod = adaptMod(item);
  switch (objective) {
    case "min-recoil":
      return mod.recoilModifier;
    case "max-ergonomics":
      return -mod.ergonomicsDelta;
    case "min-weight":
      return mod.weight;
    case "max-accuracy":
      // Negated: a larger accuracyModifier is better accuracy, and this
      // function is "smaller sorts first". See bounds.ts's max-accuracy case.
      return -mod.accuracyModifier;
  }
}

// Defensive tie-break for identical-score leaves. With the current tight
// linear lower bound and `>=` pruning, equal-score sibling branches are
// always pruned BEFORE reaching a leaf — so these helpers are structurally
// unreachable today. They remain as a safety net for future objectives /
// loose bounds that could legitimately produce score ties at leaves.
/* v8 ignore start */
function tieBreakBetter(
  newPrice: number,
  newAttachments: Readonly<Record<string, string>>,
  currentBest: MutableBest,
): boolean {
  if (newPrice !== currentBest.price) return newPrice < currentBest.price;
  return stableKey(newAttachments) < stableKey(currentBest.attachments);
}

function stableKey(attachments: Readonly<Record<string, string>>): string {
  return Object.keys(attachments)
    .sort()
    .map((k) => `${k}=${attachments[k]}`)
    .join("|");
}
/* v8 ignore stop */
