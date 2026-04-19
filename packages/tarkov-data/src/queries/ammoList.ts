import { z } from "zod";
import type { GraphQLClient } from "../client.js";

export const AMMO_LIST_QUERY = /* GraphQL */ `
  query AmmoList {
    items(type: ammo) {
      id
      name
      shortName
      iconLink
      properties {
        __typename
        ... on ItemPropertiesAmmo {
          caliber
          penetrationPower
          damage
          armorDamage
          projectileCount
        }
      }
    }
  }
`;

const ammoPropertiesSchema = z.object({
  __typename: z.literal("ItemPropertiesAmmo"),
  caliber: z.string(),
  penetrationPower: z.number(),
  damage: z.number(),
  armorDamage: z.number(),
  projectileCount: z.number(),
});

const ammoItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  iconLink: z.string().url(),
  properties: ammoPropertiesSchema,
});

export const ammoListSchema = z.object({
  items: z.array(ammoItemSchema),
});

export type AmmoListItem = z.infer<typeof ammoItemSchema>;

/**
 * Fetch the full list of ammo items, validated against {@link ammoListSchema}.
 */
export async function fetchAmmoList(client: GraphQLClient): Promise<AmmoListItem[]> {
  const raw = await client.request<unknown>(AMMO_LIST_QUERY);
  return ammoListSchema.parse(raw).items;
}
