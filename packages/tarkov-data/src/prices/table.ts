/**
 * The price table: every price the Builder needs, read out of an upstream items document.
 *
 * This module, and everything under `src/prices/`, imports nothing but itself. The price Web
 * Worker bundles it through the `@tarkov/data/prices` subpath, and a worker that pulled in
 * zod, React or the translation merge would ship them for nothing.
 */

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
 * The flea price in roubles: `lastLowPrice`, the cheapest listing upstream last saw, or `null`
 * when the item is not listed. `avg24hPrice` is not a price anyone can pay — on 2026-10-17 it
 * was above `lastLowPrice` for 856 of the 1,162 items where the two differ.
 *
 * `undefined` (the table holds no entry for the item) is also `null`; whether that means
 * "unlisted" or "not known" is `priceOffers`' call, which knows whether there is a table.
 */
export function fleaPriceFromTuple(tuple: ItemPriceTuple | undefined): number | null {
  return tuple === undefined ? null : tuple[0];
}

/**
 * Read every price for `ids` out of an upstream items document.
 *
 * `lookup` returns the raw (untranslated is fine — no price field is translated) upstream
 * item for an id, or `undefined`. An id the document does not hold gets no entry, which
 * `priceOffers` reads as "not in the items document". Three callers share this: the snapshot
 * generator (release-time prices for the OG cards), the price Web Worker, and its main-thread
 * fallback.
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
 * The newest `updated` timestamp among the items, as ISO 8601, or `null` when none carries a
 * parseable one. Upstream refreshes some item every few minutes, so this is in effect when
 * the document was generated: the snapshot's `dataAsOf`, and the age of a price table.
 */
export function newestUpdated(items: Readonly<Record<string, unknown>>): string | null {
  let newest = Number.NEGATIVE_INFINITY;
  for (const raw of Object.values(items)) {
    const updated = Date.parse(String((raw as { updated?: unknown } | null)?.updated));
    if (updated > newest) newest = updated;
  }
  return newest === Number.NEGATIVE_INFINITY ? null : new Date(newest).toISOString();
}
