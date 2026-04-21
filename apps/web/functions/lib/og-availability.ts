import type { PlayerProfile } from "@tarkov/data";

export interface AvailabilityOffer {
  vendor: { normalizedName: string };
  priceRUB: number;
  minTraderLevel?: number;
}

export interface AvailabilityMod {
  id: string;
  buyFor: AvailabilityOffer[];
}

export type AvailabilityPill = "FLEA" | "LL2" | "LL3" | "LL4";

/**
 * Summarize the lowest trader level that covers every mod in the build.
 *
 * If any mod is only purchasable on flea, returns "FLEA". Otherwise returns
 * the minimum "LL{n}" that still covers the highest `minTraderLevel` seen.
 * There is no LL1 pill in the spec — clamp up to "LL2".
 */
export function availabilityPillText(
  mods: readonly AvailabilityMod[],
  _profile: PlayerProfile,
): AvailabilityPill {
  let needsFlea = false;
  let maxLevel = 1;

  for (const mod of mods) {
    if (mod.buyFor.length === 0) {
      needsFlea = true;
      continue;
    }
    const traderOffers = mod.buyFor.filter((o) => o.vendor.normalizedName !== "flea-market");
    if (traderOffers.length === 0) {
      needsFlea = true;
      continue;
    }
    const modMin = Math.min(...traderOffers.map((o) => o.minTraderLevel ?? 1));
    if (modMin > maxLevel) maxLevel = modMin;
  }

  if (needsFlea) return "FLEA";
  if (maxLevel >= 4) return "LL4";
  if (maxLevel >= 3) return "LL3";
  return "LL2";
}
