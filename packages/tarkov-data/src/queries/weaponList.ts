import { z } from "zod";
import type { GraphQLClient } from "../client.js";
import { buyForEntrySchema } from "./shared/buy-for.js";

export const WEAPON_LIST_QUERY = /* GraphQL */ `
  query WeaponList {
    items(type: gun) {
      id
      name
      shortName
      iconLink
      weight
      types
      properties {
        __typename
        ... on ItemPropertiesWeapon {
          caliber
          ergonomics
          recoilVertical
          recoilHorizontal
          fireRate
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

const weaponPropertiesSchema = z.object({
  __typename: z.literal("ItemPropertiesWeapon"),
  caliber: z.string(),
  ergonomics: z.number(),
  recoilVertical: z.number(),
  recoilHorizontal: z.number(),
  fireRate: z.number(),
});

const weaponListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  iconLink: z.string().url(),
  weight: z.number(),
  types: z.array(z.string()),
  properties: weaponPropertiesSchema,
  buyFor: z.array(buyForEntrySchema),
});

export const weaponListSchema = z.object({
  items: z.array(weaponListItemSchema),
});

const weaponListEnvelopeSchema = z.object({
  items: z.array(z.unknown()),
});

export type WeaponListItem = z.infer<typeof weaponListItemSchema>;

/**
 * Fetch the full list of weapons (`items(type: gun)`). Same filter pattern as
 * fetchAmmoList — outer envelope strict, items safe-parsed and dropped if they
 * don't match the strict per-item schema.
 */
export async function fetchWeaponList(client: GraphQLClient): Promise<WeaponListItem[]> {
  const raw = await client.request<unknown>(WEAPON_LIST_QUERY);
  const { items } = weaponListEnvelopeSchema.parse(raw);
  const out: WeaponListItem[] = [];
  for (const item of items) {
    const result = weaponListItemSchema.safeParse(item);
    if (result.success) out.push(result.data);
  }
  if (out.length < items.length && typeof console !== "undefined") {
    console.debug(
      `[fetchWeaponList] filtered ${items.length - out.length} non-weapon items (kept ${out.length}/${items.length})`,
    );
  }
  return out;
}
