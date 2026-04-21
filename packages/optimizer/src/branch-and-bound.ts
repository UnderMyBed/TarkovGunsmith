import type { BallisticMod, BallisticWeapon, WeaponSpec } from "@tarkov/ballistics";
import { weaponSpec } from "@tarkov/ballistics";
import type { ModListItem, PlayerProfile, SlotNode } from "@tarkov/data";
import { cheapestPrice, slotCandidates } from "./feasibility.js";
import { lowerBoundForRemaining } from "./bounds.js";
import { score } from "./objective.js";
import type { Objective } from "./types.js";

export interface BnbState {
  readonly weapon: BallisticWeapon;
  readonly modList: readonly ModListItem[];
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
 * Runs an exact branch-and-bound DFS over the slot tree and returns the
 * best (lowest-score) leaf found, or `null` if no leaf was ever reached
 * (e.g. the onNodeVisit callback aborted before the first completion).
 *
 * Tie-breaking: lower price wins; then lexicographic order of the sorted
 * attachments map ensures determinism.
 */
export function branchAndBound(state: BnbState, slots: readonly SlotNode[]): BnbBest | null {
  const best: { value: MutableBest | null } = { value: null };
  const visits = { count: 0 };
  dfs(state, slots, [], 0, {}, best, visits);
  return best.value;
}

function dfs(
  state: BnbState,
  remainingSlots: readonly SlotNode[],
  partialMods: ModListItem[],
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
    const stats = weaponSpec(state.weapon, partialMods.map(adaptModListItem));
    const leafScore = score(state.objective, stats);
    if (
      best.value === null ||
      leafScore < best.value.score ||
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

  const [slot, ...rest] = remainingSlots;
  if (!slot) return true;
  const candidates = slotCandidates(slot, state.modList, state.profile, state.pinnedSlots);

  // Sort candidates best-first (by single-item score) for better pruning.
  const sorted = [...candidates].sort(
    (a, b) => singleItemScore(state.objective, a) - singleItemScore(state.objective, b),
  );

  for (const candidate of sorted) {
    // Budget check.
    let additionalPrice = 0;
    if (candidate !== null) {
      const priceOrNull = cheapestPrice(candidate, state.profile);
      if (priceOrNull !== null) additionalPrice = priceOrNull;
      // else: pinned unavailable item — proceed at price 0.
    }
    const newPrice = runningPrice + additionalPrice;
    if (state.budgetRub !== undefined && newPrice > state.budgetRub) continue;

    // Sub-slots unlocked by this item.
    const subSlots: readonly SlotNode[] = candidate
      ? (slot.allowedItems.find((ai) => ai.id === candidate.id)?.children ?? [])
      : [];
    const newRemaining = [...subSlots, ...rest];

    // Lower-bound pruning.
    if (best.value !== null) {
      const partialForBoundCheck = candidate ? [...partialMods, candidate] : partialMods;
      const runningStats = weaponSpec(state.weapon, partialForBoundCheck.map(adaptModListItem));
      const bound = lowerBoundForRemaining(
        newRemaining,
        state.modList,
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

function adaptModListItem(item: ModListItem): BallisticMod {
  return {
    id: item.id,
    name: item.name,
    ergonomicsDelta: item.properties.ergonomics,
    recoilModifierPercent: item.properties.recoilModifier,
    weight: item.weight,
    accuracyDelta: item.properties.accuracyModifier,
  };
}

function singleItemScore(objective: Objective, item: ModListItem | null): number {
  if (item === null) return 0;
  switch (objective) {
    case "min-recoil":
      return item.properties.recoilModifier;
    case "max-ergonomics":
      return -item.properties.ergonomics;
    case "min-weight":
      return item.weight;
    case "max-accuracy":
      return item.properties.accuracyModifier;
  }
}

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
