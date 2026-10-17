import { barrelDeviation, CM_PER_MOA_AT_100M, type BallisticWeapon } from "@tarkov/ballistics";
import type { AttachablePart, PlayerProfile, SlotNode } from "@tarkov/data";
import { adaptMod } from "@tarkov/data";
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
  parts: ReadonlyMap<string, AttachablePart>,
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
          parts,
          profile,
          pinnedSlots,
          (m) => (m ? adaptMod(m).recoilModifier : 0),
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
          parts,
          profile,
          pinnedSlots,
          (m) => (m ? adaptMod(m).ergonomicsDelta : 0),
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
          parts,
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
          parts,
          profile,
          pinnedSlots,
          (m) => (m ? adaptMod(m).accuracyModifier : 0),
          Math.max,
        );
      }
      return accuracyBound(weapon, parts, sumAccuracy);
    }
  }
}

/** Per catalog: the largest barrel `centerOfImpact`, and the range of `deviationMax`. */
interface BarrelExtremes {
  readonly maxCenterOfImpact: number;
  readonly minDeviationMax: number;
  readonly maxDeviationMax: number;
}

const barrelExtremesCache = new WeakMap<ReadonlyMap<string, AttachablePart>, BarrelExtremes>();

function barrelExtremes(parts: ReadonlyMap<string, AttachablePart>): BarrelExtremes {
  const cached = barrelExtremesCache.get(parts);
  if (cached !== undefined) return cached;
  // 100 is `weaponSpec`'s deviationMax with no barrel mounted, so it is always in range.
  let maxCenterOfImpact = 0;
  let minDeviationMax = 100;
  let maxDeviationMax = 100;
  for (const part of parts.values()) {
    const mod = adaptMod(part);
    maxCenterOfImpact = Math.max(maxCenterOfImpact, mod.centerOfImpact);
    if (mod.deviationMax !== null) {
      minDeviationMax = Math.min(minDeviationMax, mod.deviationMax);
      maxDeviationMax = Math.max(maxDeviationMax, mod.deviationMax);
    }
  }
  const extremes = { maxCenterOfImpact, minDeviationMax, maxDeviationMax };
  barrelExtremesCache.set(parts, extremes);
  return extremes;
}

/**
 * The max-accuracy bound: the most the remaining slots can lower the running MOA by.
 *
 * `weaponSpec` computes MOA = K·D·C·(1 − a): C the summed `centerOfImpact`, D the barrel
 * deviation factor, a the summed `accuracyModifier`. That is a product, so no exact additive
 * delta exists without the running C and a, which this function is not given. It returns a
 * looser one that is still a lower bound. Over the remaining slots C can only grow (every
 * `centerOfImpact` is ≥ 0) and a grows by at most A = `sumAccuracy`. A can be negative (a
 * pinned slot offers only its pinned part, and a pinned suppressor's is −0.05); using
 * A⁺ = max(A, 0) in its place only loosens the bound, and keeps the bracket below non-negative.
 * With C_r, a_r, D_r the running values:
 *
 *   final − running ≥ K·D_lo·C_r·(1 − a_r − A⁺) − K·D_hi·C_r·(1 − a_r)
 *                   = −K·C_r·((D_hi − D_lo)(1 − a_r) + D_lo·A⁺)
 *                   ≥ −K·C_hi·(2(D_hi − D_lo) + D_lo·A⁺)
 *
 * where D_lo / D_hi are D at the smallest and largest `deviationMax` in reach (D grows with
 * it), and C_hi = the weapon's `centerOfImpact` + the largest barrel's anywhere in the catalog.
 * The last step needs the bracket non-negative and C_r ≤ C_hi, which rest on two facts about
 * the data that `pnpm verify:upstream` checks over every weapon's slot graph (conflicts ignored,
 * so it over-estimates): a build mounts at most one barrel, the only part type with a
 * `centerOfImpact`; and the summed `accuracyModifier` of any build lies in (−1, 1), so
 * 1 − a_r ≤ 2 and 1 − a_r − A⁺ ≥ 0. It also checks every mod, barrel, sight and magazine's own
 * `accuracyModifier` is a fraction in [−1, 1].
 */
function accuracyBound(
  weapon: BallisticWeapon,
  parts: ReadonlyMap<string, AttachablePart>,
  sumAccuracy: number,
): number {
  const { maxCenterOfImpact, minDeviationMax, maxDeviationMax } = barrelExtremes(parts);
  const moaPerCm = 100 / CM_PER_MOA_AT_100M;
  const lo = barrelDeviation(weapon.deviationCurve, minDeviationMax);
  const hi = barrelDeviation(weapon.deviationCurve, maxDeviationMax);
  const maxCenter = weapon.centerOfImpact + maxCenterOfImpact;
  return -moaPerCm * maxCenter * (2 * (hi - lo) + lo * Math.max(sumAccuracy, 0));
}

function bestContribution(
  slot: SlotNode,
  parts: ReadonlyMap<string, AttachablePart>,
  profile: PlayerProfile,
  pinnedSlots: ReadonlyMap<string, string | null>,
  stat: (mod: AttachablePart | null) => number,
  pick: (...values: number[]) => number,
): number {
  const candidates = slotCandidates(slot, parts, profile, pinnedSlots);
  if (candidates.length === 0) return 0;
  const values = candidates.map(stat);
  return pick(...values);
}
