import type { BallisticWeapon } from "@tarkov/ballistics";
import type { ModListItem, PlayerProfile, SlotNode } from "@tarkov/data";
import { slotCandidates } from "./feasibility.js";
import type { Objective } from "./types.js";

/**
 * Best-possible additional score contribution for `remaining` slots under
 * the given objective. Used by the B&B DFS to prune branches whose
 * best-case completion cannot beat the current best-seen score.
 *
 * The returned number is an *additive delta* against the running score,
 * not a full score — the caller adds it to what it has already accumulated.
 */
export function lowerBoundForRemaining(
  remaining: readonly SlotNode[],
  modList: readonly ModListItem[],
  profile: PlayerProfile,
  pinnedSlots: ReadonlyMap<string, string | null>,
  objective: Objective,
  weapon: BallisticWeapon,
): number {
  if (remaining.length === 0) return 0;

  switch (objective) {
    case "min-recoil": {
      let sumPercent = 0;
      for (const slot of remaining) {
        sumPercent += bestContribution(
          slot,
          modList,
          profile,
          pinnedSlots,
          (m) => m?.properties.recoilModifier ?? 0,
          Math.min,
        );
      }
      const baseRecoil = weapon.baseVerticalRecoil + weapon.baseHorizontalRecoil;
      return baseRecoil * (sumPercent / 100);
    }
    case "max-ergonomics": {
      let sumErgo = 0;
      for (const slot of remaining) {
        sumErgo += bestContribution(
          slot,
          modList,
          profile,
          pinnedSlots,
          (m) => m?.properties.ergonomics ?? 0,
          Math.max,
        );
      }
      return -sumErgo;
    }
    case "min-weight": {
      let sumWeight = 0;
      for (const slot of remaining) {
        sumWeight += bestContribution(
          slot,
          modList,
          profile,
          pinnedSlots,
          (m) => m?.weight ?? 0,
          Math.min,
        );
      }
      return sumWeight;
    }
    case "max-accuracy": {
      let sumMoa = 0;
      for (const slot of remaining) {
        sumMoa += bestContribution(
          slot,
          modList,
          profile,
          pinnedSlots,
          (m) => m?.properties.accuracyModifier ?? 0,
          Math.min,
        );
      }
      return sumMoa;
    }
  }
}

function bestContribution(
  slot: SlotNode,
  modList: readonly ModListItem[],
  profile: PlayerProfile,
  pinnedSlots: ReadonlyMap<string, string | null>,
  stat: (mod: ModListItem | null) => number,
  pick: (...values: number[]) => number,
): number {
  const candidates = slotCandidates(slot, modList, profile, pinnedSlots);
  if (candidates.length === 0) return 0;
  const values = candidates.map(stat);
  return pick(...values);
}
