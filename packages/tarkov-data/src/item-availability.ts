import type { PlayerProfile } from "./build-schema.js";
import type { BuyForEntry } from "./queries/shared/buy-for.js";

/**
 * Minimal shape `itemAvailability` needs. Both `ModListItem` and
 * `WeaponListItem` satisfy this structurally.
 */
export interface AvailabilityInput {
  readonly buyFor: readonly BuyForEntry[] | null;
  readonly types: readonly string[];
}

export type ItemAvailability =
  | {
      available: true;
      kind: "trader";
      traderNormalizedName: string;
      minLevel: number;
      priceRUB: number | null;
    }
  | { available: true; kind: "flea"; priceRUB: number | null }
  | {
      available: false;
      reason: "trader-ll-required";
      traderNormalizedName: string;
      minLevel: number;
    }
  | {
      available: false;
      reason: "quest-required";
      questNormalizedName: string;
      traderNormalizedName: string;
    }
  | { available: false; reason: "flea-locked" }
  | { available: false; reason: "no-sources" };

const TRADER_PROFILE_KEYS = [
  "prapor",
  "therapist",
  "skier",
  "peacekeeper",
  "mechanic",
  "ragman",
  "jaeger",
] as const;
type TraderKey = (typeof TRADER_PROFILE_KEYS)[number];

function isTraderKey(name: string): name is TraderKey {
  return (TRADER_PROFILE_KEYS as readonly string[]).includes(name);
}

function isFleaBlacklisted(item: AvailabilityInput): boolean {
  return item.types.includes("noFlea");
}

/**
 * Evaluate an item's availability under a player profile.
 *
 * Walks every buyFor entry. A TraderOffer is satisfied iff the profile's
 * trader LL meets `minTraderLevel` AND (no taskUnlock OR advanced-mode
 * profile has the quest marked complete). A FleaMarket offer is satisfied
 * iff `profile.flea === true` AND the item isn't on the `noFlea` list.
 *
 * Returns the cheapest satisfying path (by priceRUB, nulls sort last).
 * If nothing satisfies, returns the most-accessible unmet requirement —
 * the lowest trader-LL gate across failing trader paths, else a quest,
 * else flea-locked, else no-sources.
 *
 * Accepts any `{ buyFor, types }` shape — both `ModListItem` and
 * `WeaponListItem` satisfy `AvailabilityInput` structurally.
 */
export function itemAvailability(
  item: AvailabilityInput,
  profile: PlayerProfile,
): ItemAvailability {
  const offers = item.buyFor ?? [];
  if (offers.length === 0) {
    return { available: false, reason: "no-sources" };
  }

  type SatTrader = {
    kind: "trader";
    traderNormalizedName: string;
    minLevel: number;
    priceRUB: number | null;
  };
  type SatFlea = { kind: "flea"; priceRUB: number | null };
  const satisfied: Array<SatTrader | SatFlea> = [];
  const unmetTrader: Array<{ traderNormalizedName: string; minLevel: number }> = [];
  const unmetQuest: Array<{ questNormalizedName: string; traderNormalizedName: string }> = [];
  let sawFleaPath = false;

  for (const offer of offers) {
    const vendor = offer.vendor;
    if (vendor.__typename === "TraderOffer") {
      const traderName = vendor.trader.normalizedName;
      const minLevel = vendor.minTraderLevel ?? 1;

      if (!isTraderKey(traderName)) {
        // Fence / ref / unknown trader — skip (we don't gate these).
        continue;
      }

      const profileLevel = profile.traders[traderName];
      if (profileLevel < minLevel) {
        unmetTrader.push({ traderNormalizedName: traderName, minLevel });
        continue;
      }
      if (vendor.taskUnlock) {
        const questOk =
          profile.mode === "advanced" &&
          (profile.completedQuests ?? []).includes(vendor.taskUnlock.normalizedName);
        if (!questOk) {
          unmetQuest.push({
            questNormalizedName: vendor.taskUnlock.normalizedName,
            traderNormalizedName: traderName,
          });
          continue;
        }
      }
      satisfied.push({
        kind: "trader",
        traderNormalizedName: traderName,
        minLevel,
        priceRUB: offer.priceRUB,
      });
    } else {
      // FleaMarket
      sawFleaPath = true;
      if (isFleaBlacklisted(item)) continue;
      if (!profile.flea) continue;
      satisfied.push({ kind: "flea", priceRUB: offer.priceRUB });
    }
  }

  if (satisfied.length > 0) {
    // Pick cheapest (nulls sort last).
    satisfied.sort((a, b) => {
      const ap = a.priceRUB ?? Number.POSITIVE_INFINITY;
      const bp = b.priceRUB ?? Number.POSITIVE_INFINITY;
      return ap - bp;
    });
    const best = satisfied[0]!;
    if (best.kind === "trader") {
      return {
        available: true,
        kind: "trader",
        traderNormalizedName: best.traderNormalizedName,
        minLevel: best.minLevel,
        priceRUB: best.priceRUB,
      };
    }
    return { available: true, kind: "flea", priceRUB: best.priceRUB };
  }

  // Nothing satisfied — pick most-accessible unmet requirement.
  if (unmetTrader.length > 0) {
    unmetTrader.sort((a, b) => a.minLevel - b.minLevel);
    const easiest = unmetTrader[0]!;
    return {
      available: false,
      reason: "trader-ll-required",
      traderNormalizedName: easiest.traderNormalizedName,
      minLevel: easiest.minLevel,
    };
  }
  if (unmetQuest.length > 0) {
    const q = unmetQuest[0]!;
    return {
      available: false,
      reason: "quest-required",
      questNormalizedName: q.questNormalizedName,
      traderNormalizedName: q.traderNormalizedName,
    };
  }
  if (sawFleaPath) {
    return { available: false, reason: "flea-locked" };
  }
  return { available: false, reason: "no-sources" };
}
