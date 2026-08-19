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
      let sumFraction = 0;
      for (const slot of remaining) {
        sumFraction += bestContribution(
          slot,
          modList,
          profile,
          pinnedSlots,
          (m) => m?.properties.recoilModifier ?? 0,
          Math.min,
        );
      }
      const baseRecoil = weapon.baseVerticalRecoil + weapon.baseHorizontalRecoil;
      // MUST stay on the same scale as `weaponSpec`, which computes
      // `base * (1 + sum)` with `recoilModifier` as a fraction. The DFS prunes
      // on `score(running) + bound >= best`, which for `score = B(1 + k*sum)`
      // and `bound = B*k*sum_min` reduces to `sum_running + sum_min >= sum_best`
      // for any k > 0 — so the two are only ever consistent together. That
      // scale-invariance is why the solver still picked correct mods while both
      // sides carried the /100 error; changing one alone shrinks the bound 100x
      // toward zero, raises the projected score, and prunes the true optimum.
      return baseRecoil * sumFraction;
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
      // The best candidate per slot is the LARGEST accuracyModifier, not the
      // smallest: upstream reports positive for better accuracy (M700 AI AT
      // AICS chassis +0.06) and negative for worse (Mosin Bramit suppressor
      // -0.05). Taking Math.min here made "max-accuracy" select suppressors.
      let sumAccuracy = 0;
      for (const slot of remaining) {
        sumAccuracy += bestContribution(
          slot,
          modList,
          profile,
          pinnedSlots,
          (m) => m?.properties.accuracyModifier ?? 0,
          Math.max,
        );
      }
      // `weaponSpec` computes `accuracy = A * (1 - sum)`, so the lowest score
      // reachable from here is `A * (1 - sum_running - sum_best)`, and the
      // additive delta against the running score is `-A * sum_best`. Same
      // lockstep requirement as min-recoil: this scale is set by weaponSpec.
      return -weapon.baseAccuracy * sumAccuracy;
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
