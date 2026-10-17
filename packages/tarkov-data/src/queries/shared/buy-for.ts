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

type TraderOfferVendor = Extract<Vendor, { __typename: "TraderOffer" }>;
type TraderBarterVendor = Extract<Vendor, { __typename: "TraderBarter" }>;
type FleaMarketVendor = Extract<Vendor, { __typename: "FleaMarket" }>;

/**
 * One acquisition offer with everything except its price.
 *
 * Offers are structure (who sells it, at what loyalty level, behind which quest, for which
 * items) and change only with a game patch, so the build-time Builder snapshot carries them.
 * Prices move daily and are joined on later by {@link priceOffers}.
 *
 * - `cash`: a trader's `buyFromTrader` offer. `priceKey` names its price in a
 *   {@link PriceTable} — see {@link traderOfferKey}.
 * - `barter`: a trader barter. Its price is derived from its required items' flea prices.
 * - `flea`: the item's own flea listing, priced from the item's own entry in the table.
 */
export type UnpricedOffer =
  | {
      readonly kind: "cash";
      readonly priceKey: string;
      readonly currency: string | null;
      readonly vendor: TraderOfferVendor;
      readonly preset?: OfferPreset;
    }
  | {
      readonly kind: "barter";
      readonly vendor: Omit<TraderBarterVendor, "costUnavailableReason">;
      readonly preset?: OfferPreset;
    }
  | { readonly kind: "flea"; readonly vendor: FleaMarketVendor };

/**
 * Raw flea fields for one item, exactly as upstream sends them: `[lastLowPrice, avg24hPrice,
 * lastOfferCount]`. Which of them counts as "the" flea price is {@link fleaPriceFromTuple}'s
 * call, not the table's.
 */
export type ItemPriceTuple = readonly [
  lastLowPrice: number | null,
  avg24hPrice: number | null,
  lastOfferCount: number | null,
];

/**
 * Every price the Builder needs, separated from the offers it prices.
 *
 * `items` holds flea fields per item id; `trader` holds each cash offer's `priceRUB` under its
 * {@link traderOfferKey}. Produced by {@link extractPrices} from a raw items document.
 */
export interface PriceTable {
  readonly items: Readonly<Record<string, ItemPriceTuple>>;
  readonly trader: Readonly<Record<string, number | null>>;
}

export interface ExtractedPrices {
  readonly table: PriceTable;
  /**
   * Keys where two upstream offers collided with different prices. Such a key is priced
   * `null` in the table: an ambiguous price is not a price. The snapshot generator fails on
   * any; the runtime price path has nothing better to do than leave them unpriced.
   */
  readonly conflicts: readonly string[];
}

interface RawTraderOffer {
  trader?: unknown;
  priceRUB?: unknown;
  currency?: unknown;
  minTraderLevel?: unknown;
  taskUnlock?: unknown;
}

const keyPart = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";

/**
 * The identity of one `buyFromTrader` offer: seller (the item, or the preset that sells it),
 * trader id, loyalty level, quest gate and currency.
 *
 * Upstream offers carry no id of their own. These five fields tell every live offer apart
 * except exact duplicates, which upstream does send (four items on 2026-10-16, each listed
 * twice at the same price) and which therefore share one price.
 */
export function traderOfferKey(sellerId: string, offer: unknown): string {
  const o = (offer ?? {}) as RawTraderOffer;
  return [
    sellerId,
    keyPart(o.trader),
    keyPart(o.minTraderLevel),
    keyPart(o.taskUnlock),
    keyPart(o.currency),
  ].join("|");
}

const numberOrNull = (value: unknown): number | null => (typeof value === "number" ? value : null);

/** The raw flea fields of one upstream item. */
export function priceTupleOf(item: object): ItemPriceTuple {
  const { lastLowPrice, avg24hPrice, lastOfferCount } = item as Record<string, unknown>;
  return [numberOrNull(lastLowPrice), numberOrNull(avg24hPrice), numberOrNull(lastOfferCount)];
}

/**
 * The flea price in roubles: `avg24hPrice`, else `lastLowPrice`, else `null`.
 *
 * The one rule for which flea field counts. Issue #212 changes it to `lastLowPrice`.
 */
export function fleaPriceFromTuple(tuple: ItemPriceTuple | undefined): number | null {
  if (tuple === undefined) return null;
  return tuple[1] ?? tuple[0];
}

/** An upstream item's flea price in roubles — {@link fleaPriceFromTuple} over its own fields. */
export function fleaPriceRUB(item: unknown): number | null {
  if (item === null || typeof item !== "object") return null;
  return fleaPriceFromTuple(priceTupleOf(item));
}

/**
 * Read every price for `ids` out of an upstream items document.
 *
 * `lookup` returns the raw (untranslated is fine — no price field is translated) upstream
 * item for an id, or `undefined`. An id the document does not hold gets no entry, which
 * {@link priceOffers} reads as "not in the items document". Three callers share this: the
 * snapshot generator (release-time prices for the OG cards), the SPA's price fetch, and the
 * price Web Worker issue #212 adds.
 *
 * `sellerIds`, when given, limits trader offers to those ids: a barter ingredient is valued
 * at its flea price only, so its own trader offers are read by nothing, and a disagreement
 * among them must not count as a conflict. Without it every id's trader offers are read.
 */
export function extractPrices(
  lookup: (id: string) => unknown,
  ids: Iterable<string>,
  sellerIds?: ReadonlySet<string>,
): ExtractedPrices {
  const items: Record<string, ItemPriceTuple> = {};
  const trader: Record<string, number | null> = {};
  const conflicts = new Set<string>();
  for (const id of ids) {
    const raw = lookup(id);
    if (raw === null || typeof raw !== "object") continue;
    items[id] = priceTupleOf(raw);
    if (sellerIds !== undefined && !sellerIds.has(id)) continue;
    const { buyFromTrader } = raw as { buyFromTrader?: unknown };
    if (!Array.isArray(buyFromTrader)) continue;
    for (const offer of buyFromTrader as unknown[]) {
      if (offer === null || typeof offer !== "object") continue;
      const key = traderOfferKey(id, offer);
      const price = numberOrNull((offer as RawTraderOffer).priceRUB);
      if (conflicts.has(key)) continue;
      if (key in trader && trader[key] !== price) {
        conflicts.add(key);
        trader[key] = null;
        continue;
      }
      trader[key] = price;
    }
  }
  return { table: { items, trader }, conflicts: [...conflicts].sort() };
}

/**
 * Every id whose price an item's offers depend on: the item itself (its flea listing), each
 * preset that sells it, and each barter's required items.
 */
export function offerPriceIds(itemId: string, offers: readonly UnpricedOffer[]): string[] {
  const ids = new Set<string>([itemId]);
  for (const offer of offers) {
    if (offer.kind !== "flea" && offer.preset !== undefined) ids.add(offer.preset.id);
    if (offer.kind === "barter") for (const r of offer.vendor.requiredItems) ids.add(r.itemId);
  }
  return [...ids];
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

/**
 * The quest gate on an offer. An id the tasks document does not hold is reported: left `null`
 * it would read as "no quest needed", showing a quest-locked offer as obtainable.
 */
function resolveTaskUnlock(
  taskUnlock: unknown,
  taskById: ReadonlyMap<string, string>,
  at: string,
  fail: OfferProblem,
): { id: string; normalizedName: string } | null {
  if (taskUnlock === null || taskUnlock === undefined) return null;
  if (typeof taskUnlock !== "string") {
    fail(`${at}: taskUnlock is not a string`);
    return null;
  }
  const normalizedName = taskById.get(taskUnlock);
  if (normalizedName === undefined) {
    fail(`${at}: taskUnlock ${taskUnlock} is not in the tasks document`);
    return null;
  }
  return { id: taskUnlock, normalizedName };
}

/** What `barterCostRUB` needs to know about one required item. */
export interface BarterCostItem {
  name: string;
  fleaPriceRUB: number | null;
}

export type BarterCost = { priceRUB: number; reason: null } | { priceRUB: null; reason: string };

/** The parts of a barter its cost depends on. */
export interface BarterCostInput {
  readonly requiredItems: readonly { readonly item: string; readonly count: number }[];
  readonly offeredItem: { readonly count: number };
}

/**
 * The rouble value of one barter, per unit received: Σ(required count × flea price) ÷
 * offered count, rounded to a whole rouble.
 *
 * A placeholder valuation over the existing flea read, not a price model — the single price
 * model is issue #218's, and it replaces this function. Returns `null` with a reason when any
 * required item has no flea price: GP coins (every Ref barter), dogtags, and a handful of quest
 * items. A partial sum would understate the cost, so none is given.
 */
export function barterCostRUB(
  barter: BarterCostInput,
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
  // Barter validation guarantees a positive count.
  return { priceRUB: Math.round(total / barter.offeredItem.count), reason: null };
}

/**
 * Reports a problem with one offer. The generator collects these as drift; at runtime the
 * collector stays lenient and the offending offer is skipped or its gate left `null`.
 */
export type OfferProblem = (line: string) => void;

const ignoreProblem: OfferProblem = () => undefined;

/** Cash `buyFromTrader` offers on one upstream item, joined to trader/task names. */
function cashOffers(
  sellerId: string,
  item: object,
  lookups: Lookups,
  fail: OfferProblem,
  preset?: OfferPreset,
): UnpricedOffer[] {
  const { buyFromTrader } = item as { buyFromTrader?: unknown };
  if (buyFromTrader === undefined || buyFromTrader === null) return [];
  if (!Array.isArray(buyFromTrader)) {
    fail(`items/${sellerId}: buyFromTrader is not an array`);
    return [];
  }
  const offers: UnpricedOffer[] = [];
  for (const [index, raw] of (buyFromTrader as unknown[]).entries()) {
    const at = `items/${sellerId}: buyFromTrader[${index}]`;
    if (raw === null || typeof raw !== "object") {
      fail(`${at} is not an object`);
      continue;
    }
    const offer = raw as RawTraderOffer;
    if (typeof offer.priceRUB !== "number") fail(`${at}: priceRUB is not a number`);
    if (typeof offer.currency !== "string") fail(`${at}: currency is not a string`);

    const normalizedName =
      typeof offer.trader === "string" ? lookups.traderById.get(offer.trader) : undefined;
    if (normalizedName === undefined) {
      fail(`${at}: trader ${String(offer.trader)} is not in the traders document`);
      continue;
    }
    if (typeof offer.minTraderLevel !== "number") {
      fail(`${at}: minTraderLevel is not a number`);
    }

    offers.push({
      kind: "cash",
      priceKey: traderOfferKey(sellerId, offer),
      currency: typeof offer.currency === "string" ? offer.currency : null,
      vendor: {
        __typename: "TraderOffer",
        normalizedName,
        minTraderLevel: typeof offer.minTraderLevel === "number" ? offer.minTraderLevel : null,
        taskUnlock: resolveTaskUnlock(offer.taskUnlock, lookups.taskById, at, fail),
        trader: { normalizedName },
      },
      ...(preset === undefined ? {} : { preset }),
    });
  }
  return offers;
}

/** The flea offer for one upstream item, or none when it is flagged `noFlea`. */
function fleaOffers(item: object): UnpricedOffer[] {
  const { types, minLevelForFlea } = item as { types?: unknown; minLevelForFlea?: unknown };
  // Flea availability keys on the item NOT being flagged noFlea. `minLevelForFlea: 0` is a
  // legitimate "no level requirement", not an absence, so it cannot be the discriminator.
  const typeList = Array.isArray(types) ? (types as unknown[]) : [];
  if (typeList.includes("noFlea")) return [];
  return [
    {
      kind: "flea",
      vendor: {
        __typename: "FleaMarket",
        normalizedName: "flea-market",
        minPlayerLevel: typeof minLevelForFlea === "number" ? minLevelForFlea : null,
      },
    },
  ];
}

/** The translated documents offer resolution reads. Pure data — no client, no fetch. */
export interface OfferSources {
  /** The items document's id-keyed `items` map. */
  readonly items: Readonly<Record<string, unknown>>;
  /** Every trader, not just the 7 the profile gates. */
  readonly traders: readonly BuyForTrader[];
  readonly tasks: readonly BuyForTask[];
  readonly barters: readonly Barter[];
}

/** Every acquisition offer for one upstream item, unpriced. */
export type OfferCollector = (item: unknown) => UnpricedOffer[];

/**
 * Build the offer collector once over the translated documents.
 *
 * An item's offers are its own cash offers and barters, the cash offers and barters of every
 * preset whose `properties.baseItem` is the item (tagged with `preset`), and its own flea
 * offer. Preset flea listings are left out: they price an assembled gun, and the receiver's
 * own flea offer already covers flea access.
 *
 * An item without a string id gets no offers: nothing could price them. An offer whose trader
 * id resolves to nothing is skipped, because availability compares on `normalizedName` and a
 * blank one would silently match nothing; an unresolvable `taskUnlock` keeps the offer with a
 * `null` gate. Each of those, and every malformed `buyFromTrader` entry, is reported through
 * `fail`: the snapshot generator turns them into drift, while runtime callers may ignore them.
 */
export function createOfferCollector(
  sources: OfferSources,
  fail: OfferProblem = ignoreProblem,
): OfferCollector {
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

  const barterOffers = (itemId: string, preset?: OfferPreset): UnpricedOffer[] => {
    const offers: UnpricedOffer[] = [];
    for (const barter of bartersByOffered.get(itemId) ?? []) {
      const normalizedName = lookups.traderById.get(barter.trader);
      const at = `barters/${barter.id}`;
      // Same rule as cash offers: an unresolvable trader cannot be gated or named.
      if (normalizedName === undefined) {
        fail(`${at}: trader ${barter.trader} is not in the traders document`);
        continue;
      }
      offers.push({
        kind: "barter",
        vendor: {
          __typename: "TraderBarter",
          normalizedName,
          minTraderLevel: barter.minTraderLevel,
          taskUnlock: resolveTaskUnlock(barter.taskUnlock, lookups.taskById, at, fail),
          trader: { normalizedName },
          barterId: barter.id,
          offeredCount: barter.offeredItem.count,
          requiredItems: barter.requiredItems.map((r) => ({
            itemId: r.item,
            count: r.count,
            attributes: r.attributes,
          })),
        },
        ...(preset === undefined ? {} : { preset }),
      });
    }
    return offers;
  };

  return (item) => {
    if (item === null || typeof item !== "object") return [];
    const { id } = item as { id?: unknown };
    if (typeof id !== "string") return [];
    const offers = [...cashOffers(id, item, lookups, fail), ...barterOffers(id)];
    for (const { raw, preset } of presetsByBase.get(id) ?? []) {
      offers.push(
        ...cashOffers(preset.id, raw, lookups, fail, preset),
        ...barterOffers(preset.id, preset),
      );
    }
    offers.push(...fleaOffers(item));
    return offers;
  };
}

/**
 * Join prices onto one item's offers, producing the `buyFor` list every consumer reads.
 *
 * - A cash offer takes its `priceKey`'s price, or `null` when the table has none (the offer
 *   is gone upstream since the snapshot was taken, or its key is ambiguous).
 * - A barter is valued by {@link barterCostRUB} over its required items' flea prices. `nameOf`
 *   names a required item, or returns `undefined` for one the game data does not hold.
 * - The flea offer takes the item's own flea price.
 *
 * Order is preserved, so the output matches what the offers were collected in.
 */
export function priceOffers(
  itemId: string,
  offers: readonly UnpricedOffer[],
  prices: PriceTable,
  nameOf: (id: string) => string | undefined,
): BuyForEntry[] {
  const flea = (id: string) => fleaPriceFromTuple(prices.items[id]);
  const costLookup = (id: string): BarterCostItem | undefined => {
    const name = nameOf(id);
    return name === undefined ? undefined : { name, fleaPriceRUB: flea(id) };
  };
  return offers.map((offer): BuyForEntry => {
    const preset =
      offer.kind !== "flea" && offer.preset !== undefined ? { preset: offer.preset } : {};
    if (offer.kind === "cash") {
      return {
        priceRUB: prices.trader[offer.priceKey] ?? null,
        currency: offer.currency,
        vendor: offer.vendor,
        ...preset,
      };
    }
    if (offer.kind === "barter") {
      const cost = barterCostRUB(
        {
          requiredItems: offer.vendor.requiredItems.map((r) => ({
            item: r.itemId,
            count: r.count,
          })),
          offeredItem: { count: offer.vendor.offeredCount },
        },
        costLookup,
      );
      return {
        priceRUB: cost.priceRUB,
        currency: null,
        vendor: { ...offer.vendor, costUnavailableReason: cost.reason },
        ...preset,
      };
    }
    return { priceRUB: flea(itemId), currency: "RUB", vendor: offer.vendor };
  });
}

/** Every acquisition offer for one upstream item, priced. */
export type OfferResolver = (item: unknown) => BuyForEntry[];

/**
 * Collect and price an item's offers straight from the translated documents: the
 * {@link createOfferCollector} offers, priced by {@link priceOffers} from the documents' own
 * price fields. For callers that hold the documents themselves, rather than a snapshot and a
 * separate price table.
 */
export function createOfferResolver(sources: OfferSources): OfferResolver {
  const collect = createOfferCollector(sources);
  const nameOf = (id: string): string | undefined => {
    const raw = sources.items[id];
    if (raw === null || typeof raw !== "object") return undefined;
    const { name } = raw as { name?: unknown };
    return typeof name === "string" ? name : id;
  };
  return (item) => {
    const offers = collect(item);
    if (offers.length === 0) return [];
    const id = (item as { id: string }).id;
    const lookup = (key: string): unknown => (key === id ? item : sources.items[key]);
    const { table } = extractPrices(lookup, offerPriceIds(id, offers));
    return priceOffers(id, offers, table, nameOf);
  };
}
