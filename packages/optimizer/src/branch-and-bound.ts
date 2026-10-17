import type { BallisticWeapon, WeaponSpec } from "@tarkov/ballistics";
import { weaponSpec } from "@tarkov/ballistics";
import type { AttachablePart, PlayerProfile, SlotGraph, SlotNode } from "@tarkov/data";
import { adaptMod, expandSlots, itemAvailability } from "@tarkov/data";
import { cheapestPrice, slotCandidates } from "./feasibility.js";
import { lowerBoundForRemaining } from "./bounds.js";
import { score } from "./objective.js";
import type { Objective } from "./types.js";

export interface BnbState {
  readonly weapon: BallisticWeapon;
  /** The part catalog, indexed by id. */
  readonly parts: ReadonlyMap<string, AttachablePart>;
  /** The slot graph sub-slots expand from, one level per attached candidate. */
  readonly graph: SlotGraph;
  readonly profile: PlayerProfile;
  readonly pinnedSlots: ReadonlyMap<string, string | null>;
  readonly objective: Objective;
  readonly budgetRub: number | undefined;
  /** `Date.now()` deadline in ms; checked periodically via onNodeVisit. */
  readonly deadline: number;
  /**
   * Called roughly every 1000 node visits. Returns `false` to abort early
   * (used for timeout enforcement).
   */
  readonly onNodeVisit: (visits: number) => boolean;
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
 * Ties: the first leaf found at a given score wins, in candidate sort
 * order. A later leaf with an equal score is pruned before it is visited
 * (see tieBreakBetter, a dormant safeguard that would rank ties by price,
 * then by attachments, if that pruning ever changed).
 */
export function branchAndBound(state: BnbState, slots: readonly SlotNode[]): BnbBest | null {
  const best: { value: MutableBest | null } = { value: null };
  const visits = { count: 0 };
  const root: ReadonlySet<string> = new Set();
  dfs(
    state,
    slots.map((slot) => ({ slot, ancestors: root })),
    [],
    0,
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
  runningPrice: number,
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
    const stats = weaponSpec(state.weapon, partialMods.map(adaptMod));
    const leafScore = score(state.objective, stats);
    if (
      best.value === null ||
      leafScore < best.value.score ||
      // Never true today: see tieBreakBetter.
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
    // Budget check.
    let additionalPrice = 0;
    if (candidate !== null) {
      const priceOrNull = cheapestPrice(candidate, state.profile);
      if (priceOrNull !== null) {
        additionalPrice = priceOrNull;
      } else if (
        state.budgetRub !== undefined &&
        state.pinnedSlots.get(slot.path) !== candidate.id &&
        itemAvailability(candidate, state.profile).available
      ) {
        // Any obtainable candidate whose price is unknown: a flea entry with neither
        // avg24hPrice nor lastLowPrice, or a barter whose ingredient has no flea price. Its
        // cost is unknown, not zero, so the solver cannot show it fits a budget. (Unpriced
        // flea entries used to be billed at 0 here.) A pin is the user's explicit choice and
        // still goes through, as a pinned unavailable item does.
        continue;
      }
      // else: pinned unavailable item, or no budget to respect — proceed at price 0.
    }
    const newPrice = runningPrice + additionalPrice;
    if (state.budgetRub !== undefined && newPrice > state.budgetRub) continue;

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
      if (projectedScore >= best.value.score) continue;
    }

    if (candidate) {
      attachments[slot.path] = candidate.id;
      partialMods.push(candidate);
    }
    const keepGoing = dfs(state, newRemaining, partialMods, newPrice, attachments, best, visits);
    if (candidate) {
      partialMods.pop();
      delete attachments[slot.path];
    }
    if (!keepGoing) return false;
  }

  return true;
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

// Tie-break for identical-score leaves: the cheaper build, then the lower
// stable key. Unreachable for every objective, however loose its bound: the
// pruning step before a leaf has no slots remaining, so its bound is exactly
// 0, and `>=` prunes a candidate whose leaf score equals the best before the
// leaf is visited. Kept so that a change to that pruning step (a `>` instead
// of `>=`, or a bound check skipped at the last slot) still ranks ties
// deterministically.
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
