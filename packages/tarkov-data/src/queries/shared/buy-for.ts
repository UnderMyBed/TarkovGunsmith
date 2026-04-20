import { z } from "zod";

/**
 * GraphQL fragment that fetches the `buyFor` block for any `Item`. Shared
 * between the mod-list and weapon-list queries because `itemAvailability`
 * walks the same shape for both.
 */
export const BUY_FOR_FRAGMENT = /* GraphQL */ `
  fragment BuyFor on Item {
    buyFor {
      priceRUB
      currency
      vendor {
        __typename
        normalizedName
        ... on TraderOffer {
          minTraderLevel
          taskUnlock {
            id
            normalizedName
          }
          trader {
            normalizedName
          }
        }
        ... on FleaMarket {
          minPlayerLevel
        }
      }
    }
  }
`;

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
