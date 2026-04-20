import { z } from "zod";
import type { GraphQLClient } from "../client.js";

export const MOD_LIST_QUERY = /* GraphQL */ `
  query ModList {
    items(type: mods) {
      id
      name
      shortName
      iconLink
      weight
      types
      minLevelForFlea
      properties {
        __typename
        ... on ItemPropertiesWeaponMod {
          ergonomics
          recoilModifier
          accuracyModifier
        }
      }
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
  }
`;

const modPropertiesSchema = z.object({
  __typename: z.literal("ItemPropertiesWeaponMod"),
  ergonomics: z.number(),
  recoilModifier: z.number(),
  accuracyModifier: z.number(),
});

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

const vendorSchema = z.discriminatedUnion("__typename", [
  traderOfferVendorSchema,
  fleaMarketVendorSchema,
]);

const buyForEntrySchema = z.object({
  priceRUB: z.number().int().nullable(),
  currency: z.string().nullable(),
  vendor: vendorSchema,
});

const modListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  iconLink: z.string().url(),
  weight: z.number(),
  types: z.array(z.string()),
  minLevelForFlea: z.number().int().nullable(),
  properties: modPropertiesSchema,
  buyFor: z.array(buyForEntrySchema).nullable(),
});

export const modListSchema = z.object({
  items: z.array(modListItemSchema),
});

const modListEnvelopeSchema = z.object({
  items: z.array(z.unknown()),
});

export type ModListItem = z.infer<typeof modListItemSchema>;
export type ModListBuyFor = z.infer<typeof buyForEntrySchema>;
export type ModListVendor = z.infer<typeof vendorSchema>;

/**
 * Fetch the list of weapon mods that affect ergo/recoil/accuracy
 * (`ItemPropertiesWeaponMod` only — magazines, scopes, barrels, night-vision
 * are filtered out for v0.12.0; they ship in a follow-up plan that wires
 * slot-based compatibility).
 */
export async function fetchModList(client: GraphQLClient): Promise<ModListItem[]> {
  const raw = await client.request<unknown>(MOD_LIST_QUERY);
  const { items } = modListEnvelopeSchema.parse(raw);
  const out: ModListItem[] = [];
  for (const item of items) {
    const result = modListItemSchema.safeParse(item);
    if (result.success) out.push(result.data);
  }
  if (out.length < items.length && typeof console !== "undefined") {
    console.debug(
      `[fetchModList] filtered ${items.length - out.length} non-WeaponMod items (kept ${out.length}/${items.length})`,
    );
  }
  return out;
}
