import { z } from "zod";
import type { Barter } from "../barters.js";

const taskUnlockSchema = z
  .object({
    id: z.string().nullable(),
    normalizedName: z.string(),
  })
  .nullable();

const traderOfferVendorSchema = z.object({
  __typename: z.literal("TraderOffer"),
  normalizedName: z.string(),
  minTraderLevel: z.number().int().nullable(),
  taskUnlock: taskUnlockSchema,
  trader: z.object({
    normalizedName: z.string(),
  }),
});

const fleaMarketVendorSchema = z.object({
  __typename: z.literal("FleaMarket"),
  normalizedName: z.string(),
  minPlayerLevel: z.number().int().nullable(),
});

/**
 * A trader barter: same loyalty/quest gate as a cash `TraderOffer`, paid in items.
 *
 * `requiredItems[].count` is not an integer (Ref's GP coins arrive as `155.1`). The entry's
 * `priceRUB` is `barterCostRUB`'s valuation of those items per unit received, or `null` with
 * `costUnavailableReason` saying which required item has no price.
 */
const traderBarterVendorSchema = z.object({
  __typename: z.literal("TraderBarter"),
  normalizedName: z.string(),
  minTraderLevel: z.number().int().nullable(),
  taskUnlock: taskUnlockSchema,
  trader: z.object({
    normalizedName: z.string(),
  }),
  barterId: z.string(),
  offeredCount: z.number(),
  requiredItems: z.array(
    z.object({
      itemId: z.string(),
      count: z.number(),
      attributes: z.record(z.string(), z.unknown()),
    }),
  ),
  costUnavailableReason: z.string().nullable(),
});

export const vendorSchema = z.discriminatedUnion("__typename", [
  traderOfferVendorSchema,
  fleaMarketVendorSchema,
  traderBarterVendorSchema,
]);

/**
 * The preset an offer actually sells. Traders mostly sell weapons as presets — an assembled
 * gun whose `properties.baseItem` is the bare receiver — so a receiver's offers include its
 * presets' offers, tagged with this. The price on such an entry buys the whole assembly.
 */
export const offerPresetSchema = z.object({
  id: z.string(),
  normalizedName: z.string(),
});

export const buyForEntrySchema = z.object({
  priceRUB: z.number().int().nullable(),
  currency: z.string().nullable(),
  vendor: vendorSchema,
  /** Absent on the item's own offers; set when the offer sells a preset built on the item. */
  preset: offerPresetSchema.optional(),
});

export type BuyForEntry = z.infer<typeof buyForEntrySchema>;
export type Vendor = z.infer<typeof vendorSchema>;
export type OfferPreset = z.infer<typeof offerPresetSchema>;

/** Minimal trader shape this join needs. */
export interface BuyForTrader {
  id: string;
  normalizedName: string;
}

/** Minimal task shape this join needs. `id` is nullable upstream. */
export interface BuyForTask {
  id: string | null;
  normalizedName: string;
}

/** Id -> normalizedName lookups, built once per (traders, tasks) pair. */
interface Lookups {
  traderById: ReadonlyMap<string, string>;
  taskById: ReadonlyMap<string, string>;
}

function buildLookups(traders: readonly BuyForTrader[], tasks: readonly BuyForTask[]): Lookups {
  const traderById = new Map(traders.map((t) => [t.id, t.normalizedName]));
  const taskById = new Map<string, string>();
  for (const task of tasks) {
    if (task.id !== null) taskById.set(task.id, task.normalizedName);
  }
  return { traderById, taskById };
}

// `resolveBuyFor` is called once per item with the same two arrays, so its lookups are built
// once per array pair rather than per call. WeakMaps keep the cache from outliving the arrays.
const lookupCache = new WeakMap<readonly BuyForTrader[], WeakMap<readonly BuyForTask[], Lookups>>();

function lookupsFor(traders: readonly BuyForTrader[], tasks: readonly BuyForTask[]): Lookups {
  let byTasks = lookupCache.get(traders);
  if (byTasks === undefined) {
    byTasks = new WeakMap();
    lookupCache.set(traders, byTasks);
  }
  let hit = byTasks.get(tasks);
  if (hit === undefined) {
    hit = buildLookups(traders, tasks);
    byTasks.set(tasks, hit);
  }
  return hit;
}

function resolveTaskUnlock(
  taskUnlock: unknown,
  taskById: ReadonlyMap<string, string>,
): { id: string; normalizedName: string } | null {
  if (typeof taskUnlock !== "string") return null;
  const normalizedName = taskById.get(taskUnlock);
  return normalizedName === undefined ? null : { id: taskUnlock, normalizedName };
}

/**
 * An item's flea-market price in roubles: `avg24hPrice`, else `lastLowPrice`, else `null`.
 *
 * The one place this package reads a flea price from an upstream item — the flea `buyFor`
 * entry and `barterCostRUB` both go through it.
 */
export function fleaPriceRUB(item: unknown): number | null {
  if (item === null || typeof item !== "object") return null;
  const { avg24hPrice, lastLowPrice } = item as { avg24hPrice?: unknown; lastLowPrice?: unknown };
  if (typeof avg24hPrice === "number") return avg24hPrice;
  if (typeof lastLowPrice === "number") return lastLowPrice;
  return null;
}

/** What `barterCostRUB` needs to know about one required item. */
export interface BarterCostItem {
  name: string;
  fleaPriceRUB: number | null;
}

export type BarterCost = { priceRUB: number; reason: null } | { priceRUB: null; reason: string };

/**
 * The rouble value of one barter, per unit received: Σ(required count × flea price) ÷
 * offered count, rounded to a whole rouble.
 *
 * A placeholder valuation over the existing flea read (`fleaPriceRUB`), not a price model —
 * the single price model is issue #218's, and it replaces this function. Returns `null` with
 * a reason when any required item has no flea price: GP coins (every Ref barter), dogtags,
 * and a handful of quest items. A partial sum would understate the cost, so none is given.
 */
export function barterCostRUB(
  barter: Pick<Barter, "requiredItems" | "offeredItem">,
  lookup: (itemId: string) => BarterCostItem | undefined,
): BarterCost {
  let total = 0;
  for (const required of barter.requiredItems) {
    const item = lookup(required.item);
    if (item === undefined) {
      return {
        priceRUB: null,
        reason: `required item ${required.item} is not in the items document`,
      };
    }
    if (item.fleaPriceRUB === null) {
      return { priceRUB: null, reason: `${item.name} has no flea price` };
    }
    total += required.count * item.fleaPriceRUB;
  }
  // `parseBarters` guarantees a positive count.
  return { priceRUB: Math.round(total / barter.offeredItem.count), reason: null };
}

/** Cash `buyFromTrader` offers on one upstream item, joined to trader/task names. */
function cashEntries(item: object, lookups: Lookups, preset?: OfferPreset): BuyForEntry[] {
  const { buyFromTrader } = item as { buyFromTrader?: unknown };
  if (!Array.isArray(buyFromTrader)) return [];
  const entries: BuyForEntry[] = [];
  for (const raw of buyFromTrader) {
    if (raw === null || typeof raw !== "object") continue;
    const offer = raw as {
      trader?: unknown;
      priceRUB?: unknown;
      currency?: unknown;
      minTraderLevel?: unknown;
      taskUnlock?: unknown;
    };

    const normalizedName =
      typeof offer.trader === "string" ? lookups.traderById.get(offer.trader) : undefined;
    if (normalizedName === undefined) continue;

    entries.push({
      priceRUB: typeof offer.priceRUB === "number" ? offer.priceRUB : null,
      currency: typeof offer.currency === "string" ? offer.currency : null,
      vendor: {
        __typename: "TraderOffer",
        normalizedName,
        minTraderLevel: typeof offer.minTraderLevel === "number" ? offer.minTraderLevel : null,
        taskUnlock: resolveTaskUnlock(offer.taskUnlock, lookups.taskById),
        trader: { normalizedName },
      },
      ...(preset === undefined ? {} : { preset }),
    });
  }
  return entries;
}

/** The flea entry for one upstream item, or none when it is flagged `noFlea`. */
function fleaEntries(item: object): BuyForEntry[] {
  const { types, minLevelForFlea } = item as { types?: unknown; minLevelForFlea?: unknown };
  // Flea availability keys on the item NOT being flagged noFlea. `minLevelForFlea: 0` is a
  // legitimate "no level requirement", not an absence, so it cannot be the discriminator.
  const typeList = Array.isArray(types) ? types : [];
  if (typeList.includes("noFlea")) return [];
  return [
    {
      priceRUB: fleaPriceRUB(item),
      currency: "RUB",
      vendor: {
        __typename: "FleaMarket",
        normalizedName: "flea-market",
        minPlayerLevel: typeof minLevelForFlea === "number" ? minLevelForFlea : null,
      },
    },
  ];
}

/**
 * Rebuild the cash + flea `buyFor` list for one item from the JSON API's flatter shape.
 *
 * GraphQL embedded the resolved vendor. The JSON API returns bare ids —
 * `buyFromTrader[].trader` and `.taskUnlock` — and moves flea availability onto the item as
 * `minLevelForFlea`, so this joins them back into the shape `itemAvailability` already reads.
 *
 * An offer whose trader id resolves to nothing is dropped: availability compares on
 * `normalizedName`, so a blank one would silently match nothing rather than failing visibly.
 * An unresolvable `taskUnlock` is different — the offer is still real, it just has no known
 * quest gate, so it becomes `null` and the offer survives.
 *
 * Cash and flea only: no barters, no preset offers. The Builder's queries use
 * `createOfferResolver`, which adds both; this stays for callers that only hold one item.
 */
export function resolveBuyFor(
  item: unknown,
  traders: readonly BuyForTrader[],
  tasks: readonly BuyForTask[],
): BuyForEntry[] {
  if (item === null || typeof item !== "object") return [];
  const lookups = lookupsFor(traders, tasks);
  return [...cashEntries(item, lookups), ...fleaEntries(item)];
}

/** The translated documents offer resolution reads. Pure data — no client, no fetch. */
export interface OfferSources {
  /** The items document's id-keyed `items` map. */
  readonly items: Readonly<Record<string, unknown>>;
  /** Every trader, not just the 7 the profile gates — see `fetchTraderDirectory`. */
  readonly traders: readonly BuyForTrader[];
  readonly tasks: readonly BuyForTask[];
  readonly barters: readonly Barter[];
}

/** Every acquisition offer for one upstream item. */
export type OfferResolver = (item: unknown) => BuyForEntry[];

/**
 * Build the offer resolver once over the translated documents.
 *
 * An item's offers are its own cash offers and barters, the cash offers and barters of every
 * preset whose `properties.baseItem` is the item (tagged with `preset`), and its own flea
 * entry. Preset flea listings are left out: they price an assembled gun, and the receiver's
 * own flea entry already covers flea access.
 *
 * Pure over its inputs so a release-time snapshot (#211) can run it without React or fetch.
 * Every lookup is built here, not per item. Works for any item type — anything with presets
 * or barters picks them up without changes here.
 */
export function createOfferResolver(sources: OfferSources): OfferResolver {
  const lookups = buildLookups(sources.traders, sources.tasks);

  const bartersByOffered = new Map<string, Barter[]>();
  for (const barter of sources.barters) {
    const list = bartersByOffered.get(barter.offeredItem.item);
    if (list === undefined) bartersByOffered.set(barter.offeredItem.item, [barter]);
    else list.push(barter);
  }

  const presetsByBase = new Map<string, { raw: object; preset: OfferPreset }[]>();
  for (const [id, raw] of Object.entries(sources.items)) {
    if (raw === null || typeof raw !== "object") continue;
    const { properties, normalizedName } = raw as {
      properties?: { propertiesType?: unknown; baseItem?: unknown } | null;
      normalizedName?: unknown;
    };
    if (properties?.propertiesType !== "ItemPropertiesPreset") continue;
    if (typeof properties.baseItem !== "string" || typeof normalizedName !== "string") continue;
    const entry = { raw, preset: { id, normalizedName } };
    const list = presetsByBase.get(properties.baseItem);
    if (list === undefined) presetsByBase.set(properties.baseItem, [entry]);
    else list.push(entry);
  }

  const costLookup = (itemId: string): BarterCostItem | undefined => {
    const raw = sources.items[itemId];
    if (raw === null || typeof raw !== "object") return undefined;
    const { name } = raw as { name?: unknown };
    return { name: typeof name === "string" ? name : itemId, fleaPriceRUB: fleaPriceRUB(raw) };
  };

  const barterEntries = (itemId: string, preset?: OfferPreset): BuyForEntry[] => {
    const entries: BuyForEntry[] = [];
    for (const barter of bartersByOffered.get(itemId) ?? []) {
      const normalizedName = lookups.traderById.get(barter.trader);
      // Same rule as cash offers: an unresolvable trader cannot be gated or named.
      if (normalizedName === undefined) continue;
      const cost = barterCostRUB(barter, costLookup);
      entries.push({
        priceRUB: cost.priceRUB,
        currency: null,
        vendor: {
          __typename: "TraderBarter",
          normalizedName,
          minTraderLevel: barter.minTraderLevel,
          taskUnlock: resolveTaskUnlock(barter.taskUnlock, lookups.taskById),
          trader: { normalizedName },
          barterId: barter.id,
          offeredCount: barter.offeredItem.count,
          requiredItems: barter.requiredItems.map((r) => ({
            itemId: r.item,
            count: r.count,
            attributes: r.attributes,
          })),
          costUnavailableReason: cost.reason,
        },
        ...(preset === undefined ? {} : { preset }),
      });
    }
    return entries;
  };

  return (item) => {
    if (item === null || typeof item !== "object") return [];
    const { id } = item as { id?: unknown };
    const entries = [...cashEntries(item, lookups)];
    if (typeof id === "string") {
      entries.push(...barterEntries(id));
      for (const { raw, preset } of presetsByBase.get(id) ?? []) {
        entries.push(...cashEntries(raw, lookups, preset), ...barterEntries(preset.id, preset));
      }
    }
    entries.push(...fleaEntries(item));
    return entries;
  };
}
