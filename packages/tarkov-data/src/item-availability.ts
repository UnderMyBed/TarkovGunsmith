import type { PlayerProfile } from "./build-schema.js";
import type { BuyForEntry, OfferPreset } from "./queries/shared/buy-for.js";

/**
 * Minimal shape `itemAvailability` needs. Both `AttachablePart` and
 * `WeaponListItem` satisfy this structurally.
 */
export interface AvailabilityInput {
  readonly buyFor: readonly BuyForEntry[] | null;
  readonly types: readonly string[];
}

/** How a trader is paid: roubles/dollars/euros (`TraderOffer`) or items (`TraderBarter`). */
export type TraderPayment = "cash" | "barter";

export type ItemAvailability =
  | {
      available: true;
      kind: "trader";
      traderNormalizedName: string;
      minLevel: number;
      priceRUB: number | null;
      /** Set when the offer sells a preset built on this item; the price is for the preset. */
      preset: OfferPreset | null;
    }
  | {
      available: true;
      kind: "barter";
      traderNormalizedName: string;
      minLevel: number;
      /** `barterCostRUB`'s valuation, or `null` when a required item has no price. */
      priceRUB: number | null;
      barterId: string;
      preset: OfferPreset | null;
    }
  | { available: true; kind: "flea"; priceRUB: number | null }
  | {
      available: false;
      reason: "trader-ll-required";
      traderNormalizedName: string;
      minLevel: number;
      payment: TraderPayment;
      preset: OfferPreset | null;
    }
  | {
      available: false;
      reason: "quest-required";
      questNormalizedName: string;
      traderNormalizedName: string;
      payment: TraderPayment;
      preset: OfferPreset | null;
    }
  | {
      available: false;
      reason: "flea-level-required";
      minPlayerLevel: number;
    }
  | {
      /** Flea is the only open path, and upstream saw no listing for the item. */
      available: false;
      reason: "flea-unlisted";
    }
  | { available: false; reason: "flea-locked" }
  | {
      /** Sold only by a trader the profile has no loyalty level for (Ref, Fence, …). */
      available: false;
      reason: "untracked-trader";
      traderNormalizedName: string;
      minLevel: number;
      payment: TraderPayment;
    }
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

/** Price ascending, `null` (unknown) last. `Infinity - Infinity` is NaN, which reads as a tie. */
function byPrice(a: number | null, b: number | null): number {
  return (a ?? Number.POSITIVE_INFINITY) - (b ?? Number.POSITIVE_INFINITY) || 0;
}

/** Code-unit order: the same on every runtime, unlike `localeCompare`, which follows ICU. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const KIND_ORDER = { trader: 0, barter: 1, flea: 2 } as const;

function isFleaBlacklisted(item: AvailabilityInput): boolean {
  return item.types.includes("noFlea");
}

/**
 * Whose access gates offers. A profile gates them by trader loyalty, quests, flea access and
 * player level. `null` is theorycraft: every gate is open, including traders a profile does
 * not track (Ref, Fence). A flea listing is not a gate: an unlisted item stays unlisted.
 */
export type PriceGate = PlayerProfile | null;

/**
 * Evaluate an item's availability under a player profile, or with every gate open (`null`).
 *
 * Walks every buyFor entry. A trader offer — cash (`TraderOffer`) or barter
 * (`TraderBarter`), the item's own or one of its presets' — is satisfied iff the profile's
 * trader LL meets `minTraderLevel` AND (no taskUnlock OR advanced-mode profile has the quest
 * marked complete). A FleaMarket offer is satisfied iff `profile.flea === true` AND the item
 * isn't on the `noFlea` list AND it is listed (no `unlisted` mark) AND `profile.level` meets
 * the offer's `minPlayerLevel`.
 *
 * Returns the cheapest satisfying path (by priceRUB, nulls sort last — so a priced cash
 * offer beats a barter whose cost is unknown). An exact price tie goes to trader cash, then
 * barter, then flea, then trader name, then offer id.
 *
 * If nothing satisfies, returns the most-accessible unmet requirement, in this precedence
 * order:
 *
 *   1. a trader-LL gate — the one the profile is fewest levels short of, then the lowest
 *      level, then cash before barter, then the cheapest known price (nulls last), then
 *      trader name, then offer id, so the pick never depends on document order;
 *   2. a quest;
 *   3. the lowest flea player-level gate;
 *   4. flea-unlisted — the flea is open to the profile but nobody is selling;
 *   5. flea-locked;
 *   6. an untracked trader (Ref, Fence) — the profile has no level for them, so nothing it
 *      can change unlocks the offer, but the offer is real and is reported, not dropped;
 *   7. no-sources.
 *
 * The flea player-level gate sits above `flea-locked` because it can only be
 * reached with `profile.flea === true` — telling that player they have no flea
 * access would be a lie. It sits below `quest-required` because a single
 * targeted quest is more accessible than a multi-level grind, and because that
 * keeps the pre-existing ordering intact.
 *
 * Accepts any `{ buyFor, types }` shape — both `AttachablePart` and
 * `WeaponListItem` satisfy `AvailabilityInput` structurally.
 */
export function itemAvailability(item: AvailabilityInput, profile: PriceGate): ItemAvailability {
  // No offers at all falls through every accumulator below to `no-sources`.
  const offers = item.buyFor ?? [];

  type SatTrader = {
    kind: "trader";
    traderNormalizedName: string;
    minLevel: number;
    priceRUB: number | null;
    preset: OfferPreset | null;
  };
  type SatBarter = Omit<SatTrader, "kind"> & { kind: "barter"; barterId: string };
  type SatFlea = { kind: "flea"; priceRUB: number | null };
  type Unmet = {
    traderNormalizedName: string;
    minLevel: number;
    payment: TraderPayment;
    preset: OfferPreset | null;
    /** Tie-break only: the offer's price, and a stable id for it. */
    priceRUB: number | null;
    offerKey: string;
  };
  // `trader` and `offerKey` are tie-break keys only; they never reach the result.
  const satisfied: Array<{
    sat: SatTrader | SatBarter | SatFlea;
    trader: string;
    offerKey: string;
  }> = [];
  const unmetTrader: Array<Unmet & { shortBy: number }> = [];
  const unmetQuest: Array<Unmet & { questNormalizedName: string }> = [];
  const unmetFleaLevel: Array<{ minPlayerLevel: number }> = [];
  const untracked: Unmet[] = [];
  let sawFleaPath = false;
  let sawUnlisted = false;

  for (const offer of offers) {
    const vendor = offer.vendor;
    switch (vendor.__typename) {
      case "TraderOffer":
      case "TraderBarter": {
        const traderName = vendor.trader.normalizedName;
        const minLevel = vendor.minTraderLevel ?? 1;
        const payment: TraderPayment = vendor.__typename === "TraderBarter" ? "barter" : "cash";
        const preset = offer.preset ?? null;
        // Cash offers carry no upstream id; trader + preset identifies one well enough to
        // make the ordering total.
        const offerKey =
          vendor.__typename === "TraderBarter"
            ? vendor.barterId
            : `cash:${traderName}:${preset?.id ?? "own"}`;
        const tie = { priceRUB: offer.priceRUB, offerKey };
        const base = {
          traderNormalizedName: traderName,
          minLevel,
          priceRUB: offer.priceRUB,
          preset,
        };
        const sat: SatTrader | SatBarter =
          vendor.__typename === "TraderBarter"
            ? { ...base, kind: "barter", barterId: vendor.barterId }
            : { ...base, kind: "trader" };

        if (profile === null) {
          satisfied.push({ sat, trader: traderName, offerKey });
          continue;
        }
        if (!isTraderKey(traderName)) {
          untracked.push({ traderNormalizedName: traderName, minLevel, payment, preset, ...tie });
          continue;
        }

        const profileLevel = profile.traders[traderName];
        if (profileLevel < minLevel) {
          unmetTrader.push({
            traderNormalizedName: traderName,
            minLevel,
            payment,
            preset,
            ...tie,
            shortBy: minLevel - profileLevel,
          });
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
              minLevel,
              payment,
              preset,
              ...tie,
            });
            continue;
          }
        }
        satisfied.push({ sat, trader: traderName, offerKey });
        break;
      }
      case "FleaMarket": {
        sawFleaPath = true;
        if (isFleaBlacklisted(item)) continue;
        if (offer.unlisted === true) {
          sawUnlisted = true;
          continue;
        }
        const fleaSat = { sat: { kind: "flea", priceRUB: offer.priceRUB } as SatFlea, trader: "" };
        if (profile === null) {
          satisfied.push({ ...fleaSat, offerKey: "flea" });
          continue;
        }
        if (!profile.flea) continue;
        // Upstream's `minLevelForFlea`, mapped onto the vendor by `createOfferCollector`. Absent
        // and 0 both mean "no level requirement", and `?? 1` collapses them onto the
        // profile's own floor of 1 so neither can accidentally gate anything.
        const minPlayerLevel = vendor.minPlayerLevel ?? 1;
        // Phrased as "does it meet the gate?" rather than "does it fail the gate?" so the
        // polarity is safe. `PlayerProfile.level` is typed non-optional, but if a hand-built
        // profile ever reaches here without one, `undefined >= n` is false and the item
        // reports as gated — visibly wrong. The `<` form would have made `undefined < n`
        // false too, silently handing out all 778 level-locked mods with no symptom.
        if (!(profile.level >= minPlayerLevel)) {
          unmetFleaLevel.push({ minPlayerLevel });
          continue;
        }
        satisfied.push({ ...fleaSat, offerKey: "flea" });
        break;
      }
      default: {
        const unhandled: never = vendor;
        throw new Error(`itemAvailability: unhandled vendor ${JSON.stringify(unhandled)}`);
      }
    }
  }

  if (satisfied.length > 0) {
    // Cheapest first (nulls last). Ties are broken by kind (trader, barter, flea), then
    // trader name, then offer id, so the pick never depends on document order.
    satisfied.sort(
      (a, b) =>
        byPrice(a.sat.priceRUB, b.sat.priceRUB) ||
        KIND_ORDER[a.sat.kind] - KIND_ORDER[b.sat.kind] ||
        compareText(a.trader, b.trader) ||
        compareText(a.offerKey, b.offerKey),
    );
    const best = satisfied[0]!.sat;
    if (best.kind === "flea") return { available: true, kind: "flea", priceRUB: best.priceRUB };
    return { available: true, ...best };
  }

  // Nothing satisfied — pick most-accessible unmet requirement.
  const cashFirst = (a: Unmet, b: Unmet): number =>
    a.payment === b.payment ? 0 : a.payment === "cash" ? -1 : 1;
  // Final keys make the pick independent of document order: cheapest known price (nulls
  // last, as in the `satisfied` sort), then trader name, then the offer's own id.
  const stable = (a: Unmet, b: Unmet): number =>
    byPrice(a.priceRUB, b.priceRUB) ||
    compareText(a.traderNormalizedName, b.traderNormalizedName) ||
    compareText(a.offerKey, b.offerKey);

  if (unmetTrader.length > 0) {
    unmetTrader.sort(
      (a, b) => a.shortBy - b.shortBy || a.minLevel - b.minLevel || cashFirst(a, b) || stable(a, b),
    );
    const { traderNormalizedName, minLevel, payment, preset } = unmetTrader[0]!;
    return {
      available: false,
      reason: "trader-ll-required",
      traderNormalizedName,
      minLevel,
      payment,
      preset,
    };
  }
  if (unmetQuest.length > 0) {
    unmetQuest.sort(
      (a, b) =>
        cashFirst(a, b) ||
        stable(a, b) ||
        compareText(a.questNormalizedName, b.questNormalizedName),
    );
    const { questNormalizedName, traderNormalizedName, payment, preset } = unmetQuest[0]!;
    return {
      available: false,
      reason: "quest-required",
      questNormalizedName,
      traderNormalizedName,
      payment,
      preset,
    };
  }
  if (unmetFleaLevel.length > 0) {
    // Lowest gate first, mirroring the `unmetTrader` sort — report the nearest
    // requirement, not an arbitrary one.
    unmetFleaLevel.sort((a, b) => a.minPlayerLevel - b.minPlayerLevel);
    return {
      available: false,
      reason: "flea-level-required",
      minPlayerLevel: unmetFleaLevel[0]!.minPlayerLevel,
    };
  }
  if (sawUnlisted) {
    return { available: false, reason: "flea-unlisted" };
  }
  if (sawFleaPath) {
    return { available: false, reason: "flea-locked" };
  }
  if (untracked.length > 0) {
    untracked.sort((a, b) => a.minLevel - b.minLevel || cashFirst(a, b) || stable(a, b));
    const { traderNormalizedName, minLevel, payment } = untracked[0]!;
    return {
      available: false,
      reason: "untracked-trader",
      traderNormalizedName,
      minLevel,
      payment,
    };
  }
  return { available: false, reason: "no-sources" };
}
