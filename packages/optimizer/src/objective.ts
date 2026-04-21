import type { WeaponSpec } from "@tarkov/ballistics";
import type { Objective } from "./types.js";

/**
 * Normalize every objective to "smaller is better" so the DFS can always
 * minimize. Higher-is-better stats (ergonomics) are negated.
 */
export function score(objective: Objective, stats: WeaponSpec): number {
  switch (objective) {
    case "min-recoil":
      return stats.verticalRecoil + stats.horizontalRecoil;
    case "max-ergonomics":
      return -stats.ergonomics;
    case "min-weight":
      return stats.weight;
    case "max-accuracy":
      return stats.accuracy;
  }
}
