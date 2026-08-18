import { z } from "zod";

const traderOfferVendorSchema = z.object({
  __typename: z.literal("TraderOffer"),
  normalizedName: z.string(),
  minTraderLevel: z.number().int().nullable(),
  taskUnlock: z
    .object({
      id: z.string().nullable(),
      normalizedName: z.string(),
    })
    .nullable(),
  trader: z.object({
    normalizedName: z.string(),
  }),
});

const fleaMarketVendorSchema = z.object({
  __typename: z.literal("FleaMarket"),
  normalizedName: z.string(),
  minPlayerLevel: z.number().int().nullable(),
});

export const vendorSchema = z.discriminatedUnion("__typename", [
  traderOfferVendorSchema,
  fleaMarketVendorSchema,
]);

export const buyForEntrySchema = z.object({
  priceRUB: z.number().int().nullable(),
  currency: z.string().nullable(),
  vendor: vendorSchema,
});

export type BuyForEntry = z.infer<typeof buyForEntrySchema>;
export type Vendor = z.infer<typeof vendorSchema>;

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

/**
 * Rebuild the `buyFor` list for one item from the JSON API's flatter shape.
 *
 * GraphQL embedded the resolved vendor. The JSON API returns bare ids —
 * `buyFromTrader[].trader` and `.taskUnlock` — and moves flea availability onto the item as
 * `minLevelForFlea`, so this joins them back into the shape `itemAvailability` already reads.
 *
 * An offer whose trader id resolves to nothing is dropped: availability compares on
 * `normalizedName`, so a blank one would silently match nothing rather than failing visibly.
 * An unresolvable `taskUnlock` is different — the offer is still real, it just has no known
 * quest gate, so it becomes `null` and the offer survives.
 */
export function resolveBuyFor(
  item: unknown,
  traders: readonly BuyForTrader[],
  tasks: readonly BuyForTask[],
): BuyForEntry[] {
  if (item === null || typeof item !== "object") return [];

  const traderById = new Map(traders.map((t) => [t.id, t.normalizedName]));
  const taskById = new Map<string, string>();
  for (const task of tasks) {
    if (task.id !== null) taskById.set(task.id, task.normalizedName);
  }

  const { buyFromTrader, types, minLevelForFlea, avg24hPrice, lastLowPrice } = item as {
    buyFromTrader?: unknown;
    types?: unknown;
    minLevelForFlea?: unknown;
    avg24hPrice?: unknown;
    lastLowPrice?: unknown;
  };

  const entries: BuyForEntry[] = [];

  if (Array.isArray(buyFromTrader)) {
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
        typeof offer.trader === "string" ? traderById.get(offer.trader) : undefined;
      if (normalizedName === undefined) continue;

      const unlockName =
        typeof offer.taskUnlock === "string" ? taskById.get(offer.taskUnlock) : undefined;

      entries.push({
        priceRUB: typeof offer.priceRUB === "number" ? offer.priceRUB : null,
        currency: typeof offer.currency === "string" ? offer.currency : null,
        vendor: {
          __typename: "TraderOffer",
          normalizedName,
          minTraderLevel: typeof offer.minTraderLevel === "number" ? offer.minTraderLevel : null,
          taskUnlock:
            unlockName === undefined
              ? null
              : { id: offer.taskUnlock as string, normalizedName: unlockName },
          trader: { normalizedName },
        },
      });
    }
  }

  // Flea availability keys on the item NOT being flagged noFlea. `minLevelForFlea: 0` is a
  // legitimate "no level requirement", not an absence, so it cannot be the discriminator.
  const typeList = Array.isArray(types) ? types : [];
  if (!typeList.includes("noFlea")) {
    const price =
      typeof avg24hPrice === "number"
        ? avg24hPrice
        : typeof lastLowPrice === "number"
          ? lastLowPrice
          : null;
    entries.push({
      priceRUB: price,
      currency: "RUB",
      vendor: {
        __typename: "FleaMarket",
        normalizedName: "flea-market",
        minPlayerLevel: typeof minLevelForFlea === "number" ? minLevelForFlea : null,
      },
    });
  }

  return entries;
}
